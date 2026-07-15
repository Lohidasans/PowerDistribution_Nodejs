const { models, sequelize } = require("../models");
const { Op } = require("sequelize");
const { QueryTypes } = require("sequelize");
const commonService = require("./commonService");
const { dateFilter } = require("../helpers/dateHelper");
const { generateBranchSeriesCode } = require("../helpers/codeGeneration");
const country = require("../models/country");
const districts = require("../models/districts");
const { buildInvoiceSummary, getSalesInvoiceType } = require("../helpers/onlineInvoiceHelper");

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
        c.address,

        -- Billing Address
        ca_bill.name AS billing_name,
        ca_bill.mobile_number AS billing_mobile,
        ca_bill.address_line AS billing_address_line,
        ca_bill.pin_code AS billing_pin_code,
        bill_country.country_name AS billing_country,
        bill_state.state_name AS billing_state,
        bill_district.district_name AS billing_district,

        -- Shipping Address
        ca_ship.name AS shipping_name,
        ca_ship.mobile_number AS shipping_mobile,
        ca_ship.address_line AS shipping_address_line,
        ca_ship.pin_code AS shipping_pin_code,
        ship_country.country_name AS shipping_country,
        ship_state.state_name AS shipping_state,
        ship_district.district_name AS shipping_district

      FROM orders o

      JOIN customers c ON c.id = o.customer_id AND c.deleted_at IS NULL
      LEFT JOIN customer_addresses ca_bill ON ca_bill.id = o.billing_address_id AND ca_bill.deleted_at IS NULL
      LEFT JOIN countries bill_country ON bill_country.id = ca_bill.country_id
      LEFT JOIN states bill_state ON bill_state.id = ca_bill.state_id
      LEFT JOIN districts bill_district ON bill_district.id = ca_bill.district_id::INTEGER
      LEFT JOIN customer_addresses ca_ship ON ca_ship.id = o.shipping_address_id AND ca_ship.deleted_at IS NULL
      LEFT JOIN countries ship_country ON ship_country.id = ca_ship.country_id
      LEFT JOIN states ship_state ON ship_state.id = ca_ship.state_id
      LEFT JOIN districts ship_district ON ship_district.id = ca_ship.district_id::INTEGER

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

        b.branch_name, b.id as branch_id

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
    const invoices = await getOnlineOrderInvoices(orderInfo, order_id);
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
        address: orderInfo.address,

        billing_address: {
          name: orderInfo.billing_name,
          mobile: orderInfo.billing_mobile,
          address: orderInfo.billing_address_line,
          pincode: orderInfo.billing_pin_code,
          country: orderInfo.billing_country,
          state: orderInfo.billing_state,
          district: orderInfo.billing_district,
        },

        shipping_address: {
          name: orderInfo.shipping_name,
          mobile: orderInfo.shipping_mobile,
          address: orderInfo.shipping_address_line,
          pincode: orderInfo.shipping_pin_code,
          country: orderInfo.shipping_country,
          state: orderInfo.shipping_state,
          district: orderInfo.shipping_district,
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
      invoices
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

const getOnlineOrderInvoices = async (
  orderInfo,
  order_id
) => {

  const salesInvoiceType =  await getSalesInvoiceType();

  const itemsQuery = `
    SELECT
      oi.id AS order_item_id,

      ROW_NUMBER() OVER (PARTITION BY COALESCE(oi.branch_id, pr.branch_id) ORDER BY oi.id) AS s_no,

      oi.product_id,
      oi.product_item_id AS product_item_detail_id,
      oi.product_name,
      oi.sku_id,
      oi.image_url,

      oi.quantity,
      oi.rate,
      oi.amount,

      COALESCE(oi.discount,0) AS discount_amount,
      COALESCE(oi.tax,0) AS tax_amount,

      oi.total_amount,

      oi.gross_weight,
      oi.net_weight,
      oi.wastage,

      pr.hsn_code,

      COALESCE( oi.branch_id, pr.branch_id) AS branch_id,

      b.branch_name

    FROM order_items oi

    JOIN products pr ON pr.id = oi.product_id

    LEFT JOIN branches b ON b.id = COALESCE(
        oi.branch_id,
        pr.branch_id
      )

    WHERE oi.order_id = :order_id
    AND oi.deleted_at IS NULL

    ORDER BY oi.id
  `;

  const invoiceItems =
    await sequelize.query(itemsQuery, {
      replacements: { order_id },
      type: sequelize.QueryTypes.SELECT,
    });

  if (!invoiceItems.length) {
    return [];
  }

  const branchIds = [
    ...new Set(
      invoiceItems.map(
        (x) => x.branch_id
      )
    ),
  ];

  const settings =
    await models.InvoiceSetting.findAll({
      where: {
        branch_id: branchIds,
        invoice_sequence_name_id:
          salesInvoiceType.id,
      },
      raw: true,
    });

  const settingMap = new Map(
    settings.map((x) => [
      String(x.branch_id),
      x,
    ])
  );

  const grouped =
    invoiceItems.reduce(
      (acc, item) => {
        const key =
          String(item.branch_id);

        if (!acc[key]) {
          acc[key] = [];
        }

        acc[key].push(item);
        return acc;
      },
      {}
    );

  const invoices = [];

  for (const branchId of Object.keys(grouped)) {
    const items =
      grouped[branchId];

    const setting =
      settingMap.get(branchId);

    if (!setting) {
      continue;
    }

    const invoiceNo = await generateBranchSeriesCode(
        models.OnlineOrderInvoice,
        "invoice_no",
        setting.invoice_prefix,
        `${setting.invoice_suffix}/ONL`,
        setting.invoice_start_no || "001",
        branchId
      );

    invoices.push({
      invoice_no: invoiceNo,
      invoice_type: {
        id: salesInvoiceType.id,
        name:
          salesInvoiceType.invoice_setting_enum,
      },
      order_no: orderInfo.order_number,
      order_date: orderInfo.order_date,
      invoice_date: new Date(),
      branch_id: Number(branchId),
      branch_name: items[0].branch_name,
      items: items.map(
        (item) => ({
          s_no: item.s_no,
          order_item_id: item.order_item_id,
          product_id: item.product_id,
          product_item_detail_id: item.product_item_detail_id,
          product_name: item.product_name,
          sku_id: item.sku_id,
          image_url: item.image_url,
          hsn_code: item.hsn_code,
          gross_weight: item.gross_weight,
          net_weight: item.net_weight,
          wastage: item.wastage,
          quantity: item.quantity,
          rate: item.rate || item.amount,
          amount: item.amount,
          discount_amount: item.discount_amount,
          tax_amount: item.tax_amount,
          total_amount: item.total_amount,
        })
      ),

      summary: buildInvoiceSummary( items),

      payment_details: {},
    });
  }

  return invoices;
};

module.exports = {
  getOnlineOrders,
  updateShipmentDetails,
  updateDeliveredDetails,
  getOnlineOrderDetails,
  cancelOrder,
};
