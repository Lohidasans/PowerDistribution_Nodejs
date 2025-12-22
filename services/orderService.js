const { Op } = require("sequelize");
const commonService = require("./commonService");
const { models, sequelize } = require("../models");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const enumType = require("../constants/enum");

// Generate Order Number
const generateOrderCode = async (req, res) => {
    try {
        const { prefix = "ORD" } = req.query;

        const code = await generateFiscalSeriesCode(
            models.Order,
            "order_number",
            prefix.toUpperCase(),
            { pad: 4 }
        );

        return commonService.okResponse(res, { order_number: code });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Buy Now / Create Order
const generateUniqueOrderNumber = async (transaction) => {
    let orderNumber;
    let exists = true;

    while (exists) {
        orderNumber = await generateFiscalSeriesCode(
            models.Order,
            "order_number",
            "ORD-",
            { pad: 4 }
        );

        exists = await models.Order.findOne({
            where: { order_number: orderNumber },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
    }

    return orderNumber;
};

// BUY NOW / CREATE ORDER
const createOrder = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const {
            customer_id,
            discount_amount,
            order_date,
            items = [],
        } = req.body;

        if (!customer_id || items.length === 0) {
            return commonService.badRequest(
                res,
                "customer_id and items are required"
            );
        }

        // 1️. Generate Order Number
        const orderNumber = await generateUniqueOrderNumber(transaction);

        let orderSubTotal = 0;
        let orderTaxAmount = 0;

        const orderItemsPayload = [];

        for (const item of items) {
            const {
                product_id,
                product_item_id,
                quantity,
                image_url,
                product_name,
                sku_id,
                purity,
                gross_weight,
                net_weight,
                stone_weight,
                measurement_details,
                rate,
                making_charge,
                wastage,
            } = item;

            //Fetch the product to get the product_type
            const product = await models.Product.findByPk(product_id, {
                attributes: ['product_type'],
                raw: true
            });

            if (!product) {
                throw new Error(`Product with ID ${product_id} not found`);
            }

            const product_type = product.product_type;

            // Lock product item row
            const productItem = await models.ProductItemDetail.findOne({
                where: { id: product_item_id },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!productItem) throw new Error("ProductItem not Found");
            if (productItem.quantity < quantity) throw new Error("Insufficient product quantity");            

            // Order Items Calculations based on product_type
            let amountValue, taxValue, makingChargeValue, wastageValue, totalAmount;
            const TAX_PERCENTAGE = 3; // 3% tax

            if (product_type === 'Piece Rate') {
                // For Piece Rate: amount = rate * quantity
                amountValue = Number(rate) * Number(quantity);
                makingChargeValue = 0; // Set to 0 for Piece Rate
                wastageValue = 0;     // Set to 0 for Piece Rate
                taxValue = (amountValue * TAX_PERCENTAGE) / 100;
                totalAmount = amountValue + taxValue;
            } else {
                // For Weight-Based (rate * net_weight)
                const silverValue = Number(rate) * Number(net_weight || 0);

                makingChargeValue = Number(making_charge || 0);
                wastageValue = Number(wastage || 0);

                const subtotal = silverValue + makingChargeValue + wastageValue;

                // Calculate GST (3% of Subtotal)
                taxValue = (subtotal * TAX_PERCENTAGE) / 100;
                totalAmount = subtotal + taxValue;

                // Multiply by quantity for the order items
                amountValue = silverValue * Number(quantity);
                makingChargeValue *= Number(quantity);
                wastageValue *= Number(quantity);
                taxValue *= Number(quantity);
                totalAmount *= Number(quantity);
            }

            // Order calculation
            orderSubTotal += totalAmount; // sum of all the totalAmount in the items loop
            orderTaxAmount += taxValue; // sum of all the tax in the items loop

            orderItemsPayload.push({
                product_id,
                product_item_id,
                product_name,
                image_url,
                sku_id,
                quantity,
                offer_id: 0,
                rate,
                amount: amountValue,
                making_charge: makingChargeValue,
                wastage: wastageValue,
                tax: taxValue,
                total_amount: totalAmount,
                purity,
                gross_weight,
                net_weight,
                stone_weight,
                measurement_details,
            });

            // 2️. Reduce stock
            await productItem.update(
                { quantity: productItem.quantity - quantity },
                { transaction }
            );

            // 3️. HARD DELETE from Cart only if exists
            await models.CartWishlistItem.destroy({
                where: {
                    user_id: customer_id,
                    product_item_id,
                    order_item_type: enumType.ITEM_TYPE.CART
                },
                force: true,
                transaction,
            });
        }

        // 4️. Create Order
        const order = await models.Order.create(
            {
                order_number: orderNumber,
                order_date,
                customer_id,
                order_status: 1,
                subtotal: orderSubTotal,  // sum of item total_amount
                tax_amount: orderTaxAmount,  // sum of item tax
                discount_amount,
                total_amount: orderSubTotal - discount_amount, //Do NOT add tax again here — it's already inside subtotal
            },
            { transaction }
        );

        // 5️. Bulk Create Order Items
        const finalItems = orderItemsPayload.map((i) => ({
            ...i,
            order_id: order.id,
        }));

        await models.OrderItem.bulkCreate(finalItems, { transaction });

        await transaction.commit();

        // 6️. Response
        const [orderData, orderItems] = await Promise.all([
            models.Order.findByPk(order.id),
            models.OrderItem.findAll({ where: { order_id: order.id } }),
        ]);

        return commonService.createdResponse(res, {
            ...orderData.get({ plain: true }),
            items: orderItems,
        });
    } catch (error) {
        await transaction.rollback();
        console.error("Create Order Error:", error);
        return commonService.handleError(res, error);
    }
};

// Delete Order
const deleteOrder = async (req, res) => {
    try {
        const order = await models.Order.findByPk(req.params.id);
        if (!order) {
            return commonService.notFound(res, "Order not found");
        }

        await order.destroy();
        return commonService.noContentResponse(res);
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Get Orders
const getOrders = async (req, res) => {
    try {
        const { customer_id } = req.query;

        if (!customer_id) {
            return commonService.badRequest(res, "customer_id is required");
        }

        // 1️. Fetch orders
        const orders = await models.Order.findAll({
            where: { customer_id },
            order: [["created_at", "DESC"]],
        });

        if (orders.length === 0) {
            return commonService.okResponse(res, { orders: [] });
        }

        const orderIds = orders.map(o => o.id);

        // 2️. Fetch order items
        const orderItems = await models.OrderItem.findAll({
            where: {
                order_id: { [Op.in]: orderIds },
            },
        });

        // Group items by order_id
        const itemsByOrderId = orderItems.reduce((acc, item) => {
            if (!acc[item.order_id]) acc[item.order_id] = [];
            acc[item.order_id].push(item);
            return acc;
        }, {});

        // 3️. Fetch default customer address
        const address = await models.CustomerAddress.findOne({
            where: {
                customer_id,
                is_default: true,
            },
        });

        let addressResponse = null;

        if (address) {
            // 4️. Fetch country / state / district names
            const [country, state, district] = await Promise.all([
                models.Country.findByPk(address.country_id),
                models.State.findByPk(address.state_id),
                models.District.findByPk(address.district_id),
            ]);

            addressResponse = {
                id: address.id,
                name: address.name,
                mobile_number: address.mobile_number,
                address_line: address.address_line,
                pin_code: address.pin_code,
                country_name: country?.country_name || null,
                state_name: state?.state_name || null,
                district_name: district?.district_name || null,
            };
        }

        // 5️. Merge everything
        const response = orders.map(order => ({
            ...order.get({ plain: true }),
            delivery_address: addressResponse,
            items: itemsByOrderId[order.id] || [],
        }));

        return commonService.okResponse(res, { orders: response });
    } catch (err) {
        console.error("Get Orders Error:", err);
        return commonService.handleError(res, err);
    }
};


// Get By Id
const getOrderById = async (req, res) => {
    try {
        const order = await models.Order.findByPk(req.params.id);
        if (!order) {
            return commonService.notFound(res, "Order not found");
        }

        const items = await models.OrderItem.findAll({
            where: { order_id: order.id },
        });

        return commonService.okResponse(res, {
            ...order.get({ plain: true }),
            items,
        });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};



module.exports = {
    generateOrderCode,
    createOrder,
    deleteOrder,
    getOrders,
    getOrderById,
};
