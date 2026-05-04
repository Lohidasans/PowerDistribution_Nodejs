const { Op } = require("sequelize");
const commonService = require("./commonService");
const { models, sequelize } = require("../models");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const enumType = require("../constants/enum");
const { calculateSellingPrice, calculateFinalPriceRate } = require("../services/productService");

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
            discount_amount = 0,
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
                // Values from UI Calculation
                rate,
                amount,
                discount,
                making_charge,
                wastage,
                stone_value,
                tax,
                total_amount,
            } = item;

            // Lock product item row
            const productItem = await models.ProductItemDetail.findOne({
                where: { id: product_item_id },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!productItem) throw new Error("ProductItem not Found");
            if (productItem.quantity < quantity) throw new Error("Insufficient product quantity");            

            orderSubTotal += Number(total_amount || 0);
            orderTaxAmount += Number(tax || 0);

            orderItemsPayload.push({
                product_id,
                product_item_id,
                product_name,
                image_url,
                sku_id,
                quantity,
                offer_id: 0,

                rate,
                amount,
                discount,
                making_charge,
                wastage,
                stone_value,
                tax,
                total_amount,
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
                subtotal: orderSubTotal,
                tax_amount: orderTaxAmount,
                discount_amount,
                total_amount: orderSubTotal - Number(discount_amount || 0),
            },
            { transaction }
        );

        // 5️. Bulk Create Order Items
        const finalItems = orderItemsPayload.map(i => ({
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


const getWebsiteProductById = async (req, res) => {
  try {
    const productId = +req.params.product_id;

    // Fetch product
    const row = await commonService.findById(models.Product, productId, res);
    if (!row) return;

    const product = row.get({ plain: true });

    // Fetch material type name
    let materialTypeName = null;
    let materialPrice = 0;

    if (product.material_type_id) {
      const material = await sequelize.query(
        `SELECT material_type, material_price FROM 
        "materialTypes" WHERE id = :id`,
        {
          replacements: { id: product.material_type_id },
          type: sequelize.QueryTypes.SELECT,
          plain: true,
        }
      );
      materialTypeName = material?.material_type || null;
      materialPrice = Number(material?.material_price || 0);
    }

    // fetch product item details & additional details
    const [itemDetails, additionalDetails] = await Promise.all([
      models.ProductItemDetail.findAll({
        where: { product_id: product.id },
        order: [["id", "ASC"]],
      }),

      models.ProductAdditionalDetail.findAll({
        where: { product_id: product.id },
        order: [["id", "ASC"]],
      }),
    ]);

    // Group additional details by item_detail_id
    const addsByItem = additionalDetails.reduce((acc, add) => {
      const key = String(add.item_detail_id);
      (acc[key] = acc[key] || []).push(add);
      return acc;
    }, {});

    // Fetch wishlist/cart rows for this product
    const userItems = await models.CartWishlistItem.findAll({
      where: {
        user_id: 0,
        product_id: product.id,
        deleted_at: null,
      },
      attributes: ["product_item_id", "is_wishlisted", "is_in_cart"],
    });

    // Build lookup map by product_item_id
    const itemStateMap = {};
    userItems.forEach((x) => {
      itemStateMap[x.product_item_id] = {
        is_wishlisted: Boolean(x.is_wishlisted),
        is_in_cart: Boolean(x.is_in_cart),
      };
    });

    // GET ALL ACTIVE OFFERS
    const allOffers = await sequelize.query(
      `
      SELECT
        o.id,
        o.offer_code,
        o.offer_description,
        o.offer_type,
        o.offer_value,
        o.applicable_type_id,
        oa.material_type_id,
        oa.category_id,
        oa.subcategory_id,
        oa.product_id
      FROM offers o
      JOIN offer_applicables oa ON oa.offer_id = o.id
      WHERE o.status = 'Active'
        AND o.deleted_at IS NULL
        AND oa.deleted_at IS NULL
      `,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // FUNCTIONS
    const calcOffer = (amount, offerType, offerValue) => {
      amount = Number(amount || 0);

      if (offerType === "Percentage") {
        return (amount * Number(offerValue)) / 100;
      }

      return Number(offerValue);
    };

    const calcChargeAmount = (value, type, netWeight) => {
      value = Number(value || 0);
      netWeight = Number(netWeight || 0);

      if (type === "Amount") return value;
      if (type === "Per Gram") return value * netWeight;
      if (type === "Percentage") {
        const metalValue = netWeight * materialPrice;
        return (metalValue * value) / 100;
      }

      return 0;
    };

    const getBestOffer = (item) => {
      let bestOffer = null;
      let maxDiscount = 0;

      for (const offer of allOffers) {
        let applicable = false;
        let discount = 0;

        // 1. MATERIAL TYPE
        if (
          offer.applicable_type_id === 1 &&
          offer.material_type_id === product.material_type_id
        ) {
          applicable = true;
          discount = calcOffer(item.item_price, offer.offer_type, offer.offer_value);
        }

        // 2 CATEGORY
        if (
          offer.applicable_type_id === 2 &&
          offer.category_id === product.category_id
        ) {
          applicable = true;
          discount = calcOffer(item.item_price, offer.offer_type, offer.offer_value);
        }

        // 3 SUBCATEGORY
        if (
          offer.applicable_type_id === 3 &&
          offer.subcategory_id === product.subcategory_id
        ) {
          applicable = true;
          discount = calcOffer(item.item_price, offer.offer_type, offer.offer_value);
        }

        // 4 PRODUCT
        if (
          offer.applicable_type_id === 4 &&
          offer.product_id === product.id
        ) {
          applicable = true;
          discount = calcOffer(item.item_price, offer.offer_type, offer.offer_value);
        }

        // 5 MAKING CHARGE
        if (
          offer.applicable_type_id === 5 &&
          offer.product_id === product.id
        ) {
          applicable = true;

          const makingCharge = calcChargeAmount(
            item.making_charge,
            item.making_charge_type,
            item.net_weight
          );

          discount = calcOffer(
            makingCharge,
            offer.offer_type,
            offer.offer_value
          );
        }

        // 6 WASTAGE
        if (
          offer.applicable_type_id === 6 &&
          offer.product_id === product.id
        ) {
          applicable = true;

          const wastage = calcChargeAmount(
            item.wastage,
            item.wastage_type,
            item.net_weight
          );

          discount = calcOffer(
            wastage,
            offer.offer_type,
            offer.offer_value
          );
        }

        if (applicable && discount > maxDiscount) {
          maxDiscount = discount;

          bestOffer = {
            offer_id: offer.id,
            offer_code: offer.offer_code,
            offer_applicable_type: offer.applicable_type_id,
            offer_description: offer.offer_description,
            discount_amount: Number(discount.toFixed(2)),
          };
        }
      }

      return bestOffer;
    };

    // BUILD ITEM DETAILS
    const itemsWithAdds = await Promise.all(
      itemDetails.map(async (it) => {
        const plainItem = it.get({ plain: true });

        const priceDetails = await calculateSellingPrice(
          product,
          plainItem,
          models
        );
        plainItem.price_details = priceDetails;

        const finalPrice = calculateFinalPriceRate(
          product,
          plainItem,
          materialPrice
        );

        const itemState = itemStateMap[it.id] || {
          is_wishlisted: false,
          is_in_cart: false,
        };

        const bestOffer = getBestOffer(plainItem);

        return {
          ...plainItem,
          additional_details: addsByItem[it.id] || [],
          price_details: {
            ...priceDetails,
            final_price_rate: finalPrice.final_price_rate,
          },
          best_offer: bestOffer,
          is_wishlisted: itemState.is_wishlisted,
          is_in_cart: itemState.is_in_cart,
        };
      })
    );

    // Fetch add-on products
    let addon_products = [];
    const isAddOn =
      product.is_addOn === true || product.is_addOn === 1 || product.is_addOn === "true";

    if (isAddOn) {
      const [addonRows] = await sequelize.query(
        `
        SELECT
          pa.id,
          pa.addon_product_id,
          p.product_name,
          p.sku_id,
          p.image_urls
        FROM "productAddOns" pa
        JOIN products p ON p.id = pa.addon_product_id
        WHERE pa.product_id = :pid
        ORDER BY pa.id ASC
        `,
        { replacements: { pid: product.id },}
      );

      addon_products = addonRows;
    }

    // Fetch variant details
    const [variantDetails] = await sequelize.query(
      `
      SELECT
        pv.variant_id,
        v.variant_type,
        COALESCE(
          json_agg(
            json_build_object('id', vv.id,'value', vv.value)
            ORDER BY vv.id
          ) FILTER (WHERE vv.id IS NOT NULL),
          '[]'::json
        ) AS values
      FROM product_variants pv
      JOIN variants v ON v.id = pv.variant_id AND v.deleted_at IS NULL
      LEFT JOIN "variantValues" vv ON vv.id = ANY(pv.variant_type_ids) AND vv.deleted_at IS NULL
      WHERE pv.product_id = :pid AND pv.deleted_at IS NULL
      GROUP BY pv.variant_id, v.variant_type
      ORDER BY pv.variant_id ASC
      `,
      { replacements: { pid: product.id }, }
    );

    return commonService.okResponse(res, {
      product: {
        ...product,
        material_type_name: materialTypeName,
        material_price: materialPrice,
      },
      item_details: itemsWithAdds,
      addon_products,
      variant_details: variantDetails,
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
    getWebsiteProductById
};
