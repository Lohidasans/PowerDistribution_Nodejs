const { Op } = require("sequelize");
const commonService = require("./commonService");
const { models, sequelize } = require("../models");
const { generateFiscalSeriesCode, generateBranchSeriesCode } = require("../helpers/codeGeneration");
const enumType = require("../constants/enum");
const { calculateSellingPrice, calculateFinalPriceRate } = require("../services/productService");
const { buildInvoiceSummary, getSalesInvoiceType } = require("../helpers/onlineInvoiceHelper");

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
            shipping_address_id,
            billing_address_id,
            items = [],
        } = req.body;

        if (!customer_id ||  !shipping_address_id || !billing_address_id || items.length === 0) {
            return commonService.badRequest(
                res,
                "customer_id, shipping_address_id , billing_address_id and items are required"
            );
        }

        const shippingAddress = await models.CustomerAddress.findOne({
          where: {
              id: shipping_address_id,
              customer_id,
          },
          transaction,
        });

        if (!shippingAddress) {
          return commonService.badRequest(
              res,
              "Invalid shipping address"
          );
        }

        // Billing address validation
        if (billing_address_id) {
        const billingAddress = await models.CustomerAddress.findOne({
          where: {
              id: billing_address_id,
              customer_id,
          },
          transaction,
        });

        if (!billingAddress) {
          return commonService.badRequest(
              res,
              "Invalid billing address"
            );
          }
        }

        // 1️. Generate Order Number
        const orderNumber = await generateUniqueOrderNumber(transaction);

        let orderSubTotal = 0;
        let orderTaxAmount = 0;

        const orderItemsPayload = [];

        for (const item of items) {
            const {
                branch_id,
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

            orderSubTotal += Number(amount || 0);
            orderTaxAmount += Number(tax || 0);

            orderItemsPayload.push({
                branch_id,
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
                shipping_address_id,
                billing_address_id,
                order_status: 1,
                subtotal: orderSubTotal,
                tax_amount: orderTaxAmount,
                discount_amount,
                total_amount: orderSubTotal + orderTaxAmount - Number(discount_amount || 0),
            },
            { transaction }
        );

        // 5️. Bulk Create Order Items
        const finalItems = orderItemsPayload.map(item => ({
            ...item,
            order_id: order.id,
        }));

        const createdOrderItems = await models.OrderItem.bulkCreate(
            finalItems,
            {
                transaction,
                returning: true,
            }
        );

        await createOnlineInvoices({
            order,
            customer_id,
            orderItems: createdOrderItems,
            transaction,
        });

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


const createOnlineInvoices = async ({
    order,
    customer_id,
    orderItems,
    transaction,
}) => {

    const salesInvoiceType = await getSalesInvoiceType();

    // Get product & branch details only
    const productIds = [...new Set(orderItems.map(x => x.product_id))];
    const branchIds = [...new Set(orderItems.map(x => x.branch_id))];

    const products = await models.Product.findAll({
        where: {
            id: {
                [Op.in]: productIds,
            },
        },
        attributes: [
            "id",
            "hsn_code",
        ],
        raw: true,
        transaction,
    });

    const branches = await models.Branch.findAll({
        where: {
            id: {
                [Op.in]: branchIds,
            },
        },
        attributes: [
            "id",
            "branch_name",
        ],
        raw: true,
        transaction,
    });

    const settings = await models.InvoiceSetting.findAll({
        where: {
            branch_id: {
                [Op.in]: branchIds,
            },
            invoice_sequence_name_id: salesInvoiceType.id,
        },
        raw: true,
        transaction,
    });

    const productMap = new Map(
        products.map(p => [p.id, p])
    );

    const branchMap = new Map(
        branches.map(b => [b.id, b])
    );

    const settingMap = new Map(
        settings.map(s => [String(s.branch_id), s])
    );

    // Build invoice items from created order items
    const invoiceItems = orderItems.map(item => ({
        order_item_id: item.id,
        branch_id: item.branch_id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        tax_amount: item.tax,
        total_amount: item.total_amount,
    }));

    // Group by Branch
    const grouped = invoiceItems.reduce((acc, item) => {

        const key = String(item.branch_id);

        if (!acc[key]) {
            acc[key] = [];
        }

        acc[key].push(item);

        return acc;

    }, {});

    // Create Invoice per Branch
    for (const branchId of Object.keys(grouped)) {

        const items = grouped[branchId];

        const setting = settingMap.get(branchId);

        if (!setting) {
            throw new Error(
                `Invoice settings not found for Branch ${branchId}`
            );
        }

        const invoiceNo = await generateBranchSeriesCode(
            models.OnlineOrderInvoice,
            "invoice_no",
            setting.invoice_prefix,
            `${setting.invoice_suffix}/ONL`,
            setting.invoice_start_no || "001",
            Number(branchId)
        );

        const summary = buildInvoiceSummary(items);

        const invoice = await models.OnlineOrderInvoice.create({
            invoice_no: invoiceNo,
            order_id: order.id,
            customer_id,
            branch_id: Number(branchId),
            subtotal: summary.subtotal,
            tax_amount: summary.tax_amount,
            discount_amount: 0,
            shipping_charge: 0,
            total_amount: summary.total_amount,
            invoice_date: order.order_date || new Date(),
        }, {
            transaction,
        });

        await models.OnlineOrderInvoiceItem.bulkCreate(

            items.map(item => ({
                online_order_invoice_id: invoice.id,
                order_item_id: item.order_item_id,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount,
                tax_amount: item.tax_amount,
                total_amount: item.total_amount,
            })),

            {
                transaction,
            }
        );
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
        -- Only apply offers whose validity window covers today, so deactivated
        -- or expired offers never discount storefront products.
        AND CURRENT_DATE BETWEEN o.valid_from AND o.valid_to
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
          discount = calcOffer(item.price_details.final_price_rate, offer.offer_type, offer.offer_value);
        }

        // 2 CATEGORY
        if (
          offer.applicable_type_id === 2 &&
          offer.category_id === product.category_id
        ) {
          applicable = true;
          discount = calcOffer(item.price_details.final_price_rate, offer.offer_type, offer.offer_value);
        }

        // 3 SUBCATEGORY
        if (
          offer.applicable_type_id === 3 &&
          offer.subcategory_id === product.subcategory_id
        ) {
          applicable = true;
          discount = calcOffer(item.price_details.final_price_rate, offer.offer_type, offer.offer_value);
        }

        // 4 PRODUCT
        if (
          offer.applicable_type_id === 4 &&
          offer.product_id === product.id
        ) {
          applicable = true;
          discount = calcOffer(item.price_details.final_price_rate, offer.offer_type, offer.offer_value);
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

      // Get mapped add-on products
      const [addonRows] = await sequelize.query(
        `
        SELECT
          pa.id,
          pa.addon_product_id,
          p.product_name,
          p.sku_id,
          p.image_urls,
          p.material_type_id,
          p.category_id,
          p.subcategory_id,
          p.product_type,
          p.variation_type

        FROM "productAddOns" pa

        JOIN products p
        ON p.id = pa.addon_product_id
          AND p.deleted_at IS NULL
          AND p.status = 'Active'

        WHERE pa.product_id = :pid
          AND pa.deleted_at IS NULL

        ORDER BY pa.id ASC
        `,
        {
          replacements: {
            pid: product.id,
          },
        }
      );

      // Calculate selling price for every add-on product
      addon_products = await Promise.all(
        addonRows.map(async (addon) => {
          // Fetch full add-on product
          const addonProductRecord =
            await models.Product.findByPk(
              addon.addon_product_id
            );

          if (!addonProductRecord) {
            return {
              ...addon,
              item_detail: null,
              price_details: null,
            };
          }
          const addonProduct = addonProductRecord.get({ plain: true,});

          // GET ADD-ON MATERIAL PRICE
          let addonMaterialPrice = 0;
          if (addonProduct.material_type_id) {
            const addonMaterial =
              await sequelize.query(
                `SELECT material_price FROM "materialTypes" WHERE id = :id AND deleted_at IS NULL `,
                {
                  replacements: {id: addonProduct.material_type_id, },
                  type: sequelize.QueryTypes.SELECT,
                  plain: true,
                }
              );

            addonMaterialPrice = Number(addonMaterial?.material_price || 0);
          }

          // GET ADD-ON PRODUCT ITEM DETAIL
          const addonItemRecord =
            await models.ProductItemDetail.findOne({
              where: {
                product_id: addonProduct.id,
                is_visible: true,
                quantity: {
                    [Op.gt]: 0, // Return only item having stock
                  },
                },
              order: [["id", "ASC"]],
            });


          if (!addonItemRecord) {
            return {
              ...addon,
              material_price: addonMaterialPrice,
              item_detail: null,
              price_details: null,
            };
          }

          const addonItem = addonItemRecord.get({ plain: true,});
          // CALCULATE SELLING PRICE
          const priceDetails = await calculateSellingPrice(addonProduct, addonItem, models);
          // CALCULATE FINAL PRICE RATE
          const finalPrice = calculateFinalPriceRate(addonProduct, addonItem, addonMaterialPrice);

          return {
            id: addon.id,
            addon_product_id: addon.addon_product_id,
            product_name: addon.product_name,
            sku_id: addon.sku_id,
            image_urls: addon.image_urls,
            material_price: addonMaterialPrice,
            product_item_id: addonItem.id,
            quantity: Number(addonItem.quantity || 0),
            gross_weight: Number(addonItem.gross_weight || 0),
            net_weight: Number(addonItem.net_weight || 0),
            price_details: {
              ...priceDetails,
              final_price_rate: finalPrice.final_price_rate,
            },
          };
        })
      );
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
