const { Op } = require("sequelize");
const commonService = require("./commonService");
const { models, sequelize } = require("../models");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

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
            "ORD",
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
            image_url,
            items = [],
        } = req.body;

        if (!customer_id || items.length === 0) {
            return commonService.badRequest(
                res,
                "customer_id and items are required"
            );
        }

        // 1️⃣ Generate Order Number
        const orderNumber = await generateUniqueOrderNumber(transaction);

        let subtotal = 0;
        let taxAmount = 0;

        const orderItemsPayload = [];

        for (const item of items) {
            const {
                product_id,
                product_item_id,
                quantity,
                product_name,
                sku_id,
                purity,
                gross_weight,
                net_weight,
                stone_weight,
                measurement_details,
                rate,
                making_charge,
                tax,
                total_amount,
            } = item;

            // 🔒 Lock product item row
            const productItem = await models.ProductItemDetail.findOne({
                where: { id: product_item_id },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!productItem || productItem.quantity < quantity) {
                throw new Error("Insufficient product quantity");
            }

            subtotal += Number(rate * net_weight);
            taxAmount += Number(tax || 0);

            orderItemsPayload.push({
                product_id,
                product_item_id,
                product_name,
                sku_id,
                quantity,
                offer_id: 0,
                rate,
                amount: rate * net_weight,
                making_charge,
                tax,
                total_amount,
                purity,
                gross_weight,
                net_weight,
                stone_weight,
                measurement_details,
            });

            // 2️⃣ Reduce stock
            await productItem.update(
                { quantity: productItem.quantity - quantity },
                { transaction }
            );

            // 3️⃣ HARD DELETE from Cart/Wishlist if exists
            await models.CartWishlistItem.destroy({
                where: {
                    user_id: customer_id,
                    product_item_id,
                },
                force: true,
                transaction,
            });
        }

        // 4️⃣ Create Order
        const order = await models.Order.create(
            {
                order_number: orderNumber,
                image_url,
                customer_id,
                order_status: 1,
                subtotal,
                tax_amount: taxAmount,
                discount_amount,
                total_amount: subtotal + taxAmount - discount_amount,
            },
            { transaction }
        );

        // 5️⃣ Bulk Create Order Items
        const finalItems = orderItemsPayload.map((i) => ({
            ...i,
            order_id: order.id,
        }));

        await models.OrderItem.bulkCreate(finalItems, { transaction });

        await transaction.commit();

        // 6️⃣ Response
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
        const where = {};

        if (customer_id) where.customer_id = customer_id;

        const rows = await models.Order.findAll({
            where,
            order: [["created_at", "DESC"]],
        });

        return commonService.okResponse(res, { orders: rows });
    } catch (err) {
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
