const { models, sequelize } = require("../models");
const { QueryTypes } = require("sequelize");
const commonService = require("./commonService");
const { dateFilter } = require("../helpers/dateHelper");

// List Online Orders with optional filters
const getOnlineOrders = async (req, res) => {
    try {
        const {
            page = 1,
            limit,
            search,
            branch_id,
            from_date,
            to_date,
            date_filter,
            status // optional clicked score card status
        } = req.query;

        const replacements = {};

        const pageNum = Number(page) || 1;
        const hasPagination = !!limit;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (pageNum - 1) * limitNum : 0;

        const dateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "o.order_date",
            replacements
        );

        let searchCondition = "";
        if (search) {
            replacements.search = `%${search}%`;

            searchCondition = `
        AND (
          o.order_number ILIKE :search
          OR c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
          OR oi.product_name ILIKE :search
          OR oi.sku_id ILIKE :search
          OR b.branch_name ILIKE :search
        )
      `;
        }
        
        let branchCondition = "";
        if (branch_id) {
            replacements.branch_id = branch_id;
            branchCondition = `AND p.branch_id = :branch_id`;
        }
        
        const baseCTE = `
      WITH item_status AS (

        SELECT
          o.id,
          o.order_number,
          o.order_date,
          o.created_at,
          o.total_amount,

          c.customer_name,
          c.mobile_number,

          oi.id AS order_item_id,
          oi.product_name,
          oi.quantity,

          p.branch_id,
          b.branch_name,

          CASE
            WHEN oi.item_status = 'Cancelled' THEN 'Cancelled'
            WHEN oi.item_status = 'Delivered' THEN 'Delivered'
            WHEN oi.item_status = 'Shipped' THEN 'Shipped'
            ELSE 'New Order'
          END AS item_status

        FROM orders o

        JOIN customers c
          ON c.id = o.customer_id
          AND c.deleted_at IS NULL

        JOIN order_items oi
          ON oi.order_id = o.id
          AND oi.deleted_at IS NULL

        JOIN products p
          ON p.id = oi.product_id
          AND p.deleted_at IS NULL

        LEFT JOIN branches b
          ON b.id = p.branch_id
          AND b.deleted_at IS NULL

        WHERE o.deleted_at IS NULL
        ${dateCondition}
        ${branchCondition}
        ${searchCondition}
      ),

      order_summary AS (

        SELECT
          id,
          order_number,
          order_date,
          created_at,
          customer_name,
          mobile_number,
          total_amount,

          STRING_AGG(DISTINCT branch_name, ', ') AS branch_names,

          COUNT(*) AS total_items,
          SUM(CASE WHEN item_status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled_cnt,
          SUM(CASE WHEN item_status = 'New Order' THEN 1 ELSE 0 END) AS new_cnt,
          SUM(CASE WHEN item_status = 'Shipped' THEN 1 ELSE 0 END) AS shipped_cnt,
          SUM(CASE WHEN item_status = 'Delivered' THEN 1 ELSE 0 END) AS delivered_cnt

        FROM item_status
        GROUP BY
          id,
          order_number,
          order_date,
          created_at,
          customer_name,
          mobile_number,
          total_amount
      )

    `;

        // STATUS FILTER        
        let statusCondition = "";

        if (status === "new") {
            statusCondition = `WHERE new_cnt = total_items`;
        }

        if (status === "partially_shipped") {
            statusCondition = `
        WHERE shipped_cnt > 0
        AND delivered_cnt = 0
        AND shipped_cnt < total_items
      `;
        }

        if (status === "shipped") {
            statusCondition = `WHERE shipped_cnt = total_items`;
        }

        if (status === "partially_delivered") {
            statusCondition = `
        WHERE delivered_cnt > 0
        AND delivered_cnt < total_items
      `;
        }

        if (status === "delivered") {
            statusCondition = `WHERE delivered_cnt = total_items`;
        }

        if (status === "cancelled") {
            statusCondition = `WHERE cancelled_cnt = total_items`;
        }

        // LIST QUERY        
        const rowsQuery = `
      ${baseCTE}

      SELECT
        id AS order_id,
        ROW_NUMBER() OVER(ORDER BY order_date DESC) AS s_no,
        order_number,
        TO_CHAR(order_date,'DD/MM/YYYY') AS order_date,
        created_at,
        customer_name,
        mobile_number,
        total_items AS items,
        total_amount,
        branch_names AS branch_name,

        CASE
          WHEN cancelled_cnt = total_items THEN 'Cancelled'
          WHEN delivered_cnt = total_items THEN 'Delivered'
          WHEN delivered_cnt > 0 THEN 'Partially Delivered'
          WHEN shipped_cnt = total_items THEN 'Shipped'
          WHEN shipped_cnt > 0 THEN 'Partially Shipped'
          ELSE 'New Order'
        END AS current_status

      FROM order_summary
      ${statusCondition}

      ORDER BY created_at DESC

      ${hasPagination
                ? "LIMIT :limit OFFSET :offset"
                : ""
            }
    `;

        if (hasPagination) {
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const rows = await sequelize.query(rowsQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // SCORE CARD COUNTS      
        const summaryQuery = `
      ${baseCTE}

      SELECT
        SUM(CASE WHEN new_cnt = total_items THEN 1 ELSE 0 END) AS new_order,

        SUM(
          CASE
            WHEN shipped_cnt > 0
            AND delivered_cnt = 0
            AND shipped_cnt < total_items
            THEN 1 ELSE 0
          END
        ) AS partially_shipped,

        SUM(
          CASE
            WHEN shipped_cnt = total_items
            AND delivered_cnt = 0
            THEN 1 ELSE 0
          END
        ) AS shipped,

        SUM(
          CASE
            WHEN delivered_cnt > 0
            AND delivered_cnt < total_items
            THEN 1 ELSE 0
          END
        ) AS partially_delivered,

        SUM(
          CASE
            WHEN delivered_cnt = total_items
            THEN 1 ELSE 0
          END
        ) AS delivered,

        SUM(
          CASE
            WHEN cancelled_cnt = total_items 
            THEN 1 ELSE 0 
          END
        ) AS cancelled_order

      FROM order_summary
    `;

        const [summary] = await sequelize.query(summaryQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        const countQuery = `
      ${baseCTE}
      SELECT COUNT(*)::int AS count
      FROM order_summary
      ${statusCondition}
    `;

        const [{ count }] = await sequelize.query(countQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        return commonService.okResponse(res, {
            summary,
            totalItems: Number(count),
            currentPage: pageNum,
            rows
        });

    } catch (error) {
        console.error("getOnlineOrders Error:", error);
        return commonService.handleError(res, error);
    }
};

const updateShipmentDetails = async (req, res) => {
    try {
        const { order_item_id } = req.params;

        const {
            shipment_partner,
            tracking_id,
            processed_by
        } = req.body;

        await models.OrderItem.update(
            {
                shipment_partner,
                tracking_id,
                processed_by,
                shipped_at: new Date(),
                item_status: "Shipped"
            },
            {
                where: { id: order_item_id }
            }
        );

        return commonService.okResponse(res, {
            message: "Shipment updated successfully"
        });

    } catch (error) {
        return commonService.handleError(res, error);
    }
};

const updateDeliveredDetails = async (req, res) => {
    try {
        const { order_item_id } = req.params;

        const {
            delivered_date,
            delivered_time,
            delivered_by
        } = req.body;

        const orderItem = await models.OrderItem.findOne({
            where: {
                id: order_item_id,
                deleted_at: null
            }
        });

        if (!orderItem) {
            return commonService.badRequest(
                res,
                "Order item not found"
            );
        }

        // ONLY SHIPPED ITEMS CAN BE DELIVERED
        if (orderItem.item_status !== "Shipped") {
            return commonService.badRequest(
                res,
                "Only shipped items can be moved to delivered status"
            );
        }

        await models.OrderItem.update(
            {
                delivered_date,
                delivered_time,
                delivered_by,
                item_status: "Delivered"
            },
            {
                where: { id: order_item_id }
            }
        );

        return commonService.okResponse(res, {
            message: "Delivered updated successfully"
        });

    } catch (error) {
        return commonService.handleError(res, error);
    }
};

const getOnlineOrderDetails = async (req, res) => {
  try {
    const { order_id } = req.params;
   
    // ORDER + CUSTOMER + ADDRESS   
    const orderQuery = `
      SELECT
        o.id,
        o.order_number,
        TO_CHAR(o.order_date,'DD/MM/YYYY') AS order_date,
        o.created_at,
        o.subtotal,
        o.tax_amount,
        o.shipping_charge,
        o.discount_amount,
        o.total_amount,

        c.customer_name,
        c.mobile_number,
        c.email_id,

        -- Billing Address
        ca_bill.name AS billing_name,
        ca_bill.mobile_number AS billing_mobile,
        ca_bill.address_line || ', ' || ca_bill.pin_code AS billing_address,

        -- Shipping Address
        ca_ship.name AS shipping_name,
        ca_ship.mobile_number AS shipping_mobile,
        ca_ship.address_line || ', ' || ca_ship.pin_code AS shipping_address

      FROM orders o

      JOIN customers c 
        ON c.id = o.customer_id 
        AND c.deleted_at IS NULL

      LEFT JOIN customer_addresses ca_bill
        ON ca_bill.customer_id = c.id
        AND ca_bill.is_default = true
        AND ca_bill.deleted_at IS NULL

      LEFT JOIN customer_addresses ca_ship
        ON ca_ship.customer_id = c.id
        AND ca_ship.is_default = true
        AND ca_ship.deleted_at IS NULL

      WHERE o.id = :order_id 
      AND o.deleted_at IS NULL

      LIMIT 1
    `;

    const [orderInfo] = await sequelize.query(orderQuery, {
      replacements: { order_id },
      type: sequelize.QueryTypes.SELECT,
    });

    if (!orderInfo) {
      return commonService.badRequest(res, "Order not found");
    }
    
    // ORDER ITEMS (RAW DATA ONLY)  
    const itemsQuery = `
      SELECT
        oi.id AS order_item_id,
        oi.product_id,
        oi.product_name,
        oi.sku_id,
        oi.image_url,
        oi.quantity,
        oi.amount,
        oi.item_status,

        oi.shipment_partner,
        oi.tracking_id,
        oi.processed_by,
        oi.shipped_at,

        oi.delivered_date,
        oi.delivered_time,
        oi.delivered_by,

        b.branch_name

      FROM order_items oi

      JOIN products pr
        ON pr.id = oi.product_id
        AND pr.deleted_at IS NULL

      LEFT JOIN branches b
        ON b.id = pr.branch_id
        AND b.deleted_at IS NULL

      WHERE oi.order_id = :order_id
      AND oi.deleted_at IS NULL

      ORDER BY oi.id ASC
    `;

    const items = await sequelize.query(itemsQuery, {
      replacements: { order_id },
      type: sequelize.QueryTypes.SELECT,
    });

    // OVERALL STATUS    
    const totalItems = items.length;
    const deliveredCount = items.filter((x) => x.item_status === "Delivered").length;
    const shippedCount = items.filter((x) => x.item_status === "Shipped").length;

    let overall_status = "New Order";
    if (deliveredCount === totalItems && totalItems > 0) {
      overall_status = "Delivered";
    } else if (deliveredCount > 0) {
      overall_status = "Partially Delivered";
    } else if (shippedCount === totalItems && totalItems > 0) {
      overall_status = "Shipped";
    } else if (shippedCount > 0) {
      overall_status = "Partially Shipped";
    }
   
    // FINAL RESPONSE   
    return commonService.okResponse(res, {
      order: {
        id: orderInfo.id,
        order_number: orderInfo.order_number,
        order_date: orderInfo.order_date,
        order_created_date: orderInfo.created_at,
        overall_status,
      },

      customer_details: {
        customer_name: orderInfo.customer_name,
        mobile_number: orderInfo.mobile_number,
        email_id: orderInfo.email_id,

        billing_address: {
          name: orderInfo.billing_name,
          mobile: orderInfo.billing_mobile,
          address: orderInfo.billing_address,
        },

        shipping_address: {
          name: orderInfo.shipping_name,
          mobile: orderInfo.shipping_mobile,
          address: orderInfo.shipping_address,
        },
      },

      order_summary: {
        subtotal: orderInfo.subtotal,
        tax_amount: orderInfo.tax_amount,
        shipping_charge: orderInfo.shipping_charge,
        discount_amount: orderInfo.discount_amount,
        total_amount: orderInfo.total_amount,
      },

      payment_details: {}, // keep empty or add later
      items: items,
    });
  } catch (error) {
    console.error("getOnlineOrderDetails Error:", error);
    return commonService.handleError(res, error);
  }
};

const cancelOrder = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { order_id } = req.params;
    const { cancelled_by, cancel_reason } = req.body;

    // 1️⃣ Get Order
    const order = await models.Order.findByPk(order_id, { transaction });

    if (!order) {
      await transaction.rollback();
      return commonService.notFound(res, "Order not found");
    }

    // ❌ Prevent already cancelled
    if (order.order_status === 3) {
      await transaction.rollback();
      return commonService.badRequest(res, "Order already cancelled");
    }

    // 2️⃣ Get Order Items
    const items = await models.OrderItem.findAll({
      where: { order_id },
      transaction,
    });

    if (!items.length) {
      await transaction.rollback();
      return commonService.badRequest(res, "No items found for this order");
    }

    // ❌ Prevent cancel if any item delivered
    const blockedItems = items.some(
      (item) =>
        item.item_status === "Shipped" ||
        item.item_status === "Delivered"
    );

    if (blockedItems) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "Cannot cancel order. Some items are already shipped or delivered"
      );
    }

    // 3️⃣ Restore Stock
    for (const item of items) {
      const productItem = await models.ProductItemDetail.findByPk(
        item.product_item_id,
        { transaction, lock: transaction.LOCK.UPDATE }
      );

      if (productItem) {
        await productItem.update(
          {
            quantity: productItem.quantity + item.quantity,
          },
          { transaction }
        );
      }
    }

    // 4️⃣ Update Order Items
    await models.OrderItem.update(
      { item_status: "Cancelled" },
      { where: { order_id }, transaction }
    );

    // 5️⃣ Update Order
    await order.update(
      {
        order_status: 3,
        cancelled_by,
        cancel_reason,
        cancelled_at: new Date(),
      },
      { transaction }
    );

    await transaction.commit();

    return commonService.okResponse(res, {
      message: "Order cancelled successfully",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Cancel Order Error:", error);
    return commonService.handleError(res, error);
  }
};

const getOnlineOrderInvoice = async (req, res) => {
  try {
    const { order_id } = req.params;

    const orderQuery = `
      SELECT
        o.id,
        o.order_number,
        TO_CHAR(o.order_date,'DD/MM/YYYY') as order_date,
        o.subtotal,
        o.tax_amount,
        o.discount_amount,
        o.shipping_charge,
        o.total_amount,

        c.customer_name,
        c.mobile_number,
        ca.address_line || ', ' || ca.pin_code AS customer_address

      FROM orders o

      JOIN customers c
        ON c.id = o.customer_id

      LEFT JOIN customer_addresses ca
        ON ca.customer_id = c.id
        AND ca.is_default = true

      WHERE o.id = :order_id
      LIMIT 1
    `;

    const [orderInfo] = await sequelize.query(orderQuery, {
      replacements: { order_id },
      type: sequelize.QueryTypes.SELECT,
    });

    if (!orderInfo) {
      return commonService.badRequest(res, "Order not found");
    }

    const itemsQuery = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY oi.id) AS s_no,
        oi.product_name,
        oi.quantity,
        oi.amount AS rate,
        oi.amount

      FROM order_items oi
      WHERE oi.order_id = :order_id
      AND oi.deleted_at IS NULL
    `;

    const items = await sequelize.query(itemsQuery, {
      replacements: { order_id },
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, {
      order_no: orderInfo.order_number,
      order_date: orderInfo.order_date,
      customer_details: {
        customer_name: orderInfo.customer_name,
        address: orderInfo.customer_address,
        mobile_number: orderInfo.mobile_number
      },

      items,

      summary: {
        subtotal: orderInfo.subtotal,
        cgst: Number(orderInfo.tax_amount || 0) / 2,
        sgst: Number(orderInfo.tax_amount || 0) / 2,
        discount: orderInfo.discount_amount,
        shipping_charge: orderInfo.shipping_charge,
        total_amount: orderInfo.total_amount
      },

      payment_details: {}
    });
  } catch (error) {
    console.error("getOnlineOrderInvoice Error:", error);
    return commonService.handleError(res, error);
  }
};

module.exports = {
    getOnlineOrders,
    updateShipmentDetails,
    updateDeliveredDetails,
    getOnlineOrderDetails,
    cancelOrder,
    getOnlineOrderInvoice
};