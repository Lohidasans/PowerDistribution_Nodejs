const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { dateFilter } = require("../helpers/dateHelper");

const getVendorRevenueStatistics = async (req, res) => {
  try {
    const {
      vendor_id,
      from_date,
      to_date,
      date_filter,
      branch_id,
    } = req.query;

    const replacements = {};

    let whereConditions = ` WHERE g.deleted_at IS NULL`;

    if (vendor_id) {
      whereConditions += ` AND g.vendor_id = :vendor_id`;
      replacements.vendor_id = parseInt(vendor_id);
    }

    if (branch_id) {
      whereConditions += ` AND g.branch_id = :branch_id `;
      replacements.branch_id = parseInt(branch_id);
    }

    whereConditions += dateFilter(
      { from_date, to_date, date_filter },
      "g.grn_date",
      replacements
    );

    // MATERIAL TYPE WISE TOTAL
    const query = `
      SELECT
        mt.id AS material_type_id,
        mt.material_type,
        COALESCE(SUM(gi.total_amount), 0) AS total_amount
      FROM grns g
      INNER JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      LEFT JOIN "materialTypes" mt ON mt.id = gi.material_type_id
      
      ${whereConditions}

      GROUP BY mt.id, mt.material_type
      ORDER BY total_amount DESC
    `;

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // TOTAL AMOUNT
    const grandTotal = results.reduce(
      (sum, item) => sum + Number(item.total_amount || 0),
      0
    );

    const formatted = results.map((item) => {
      const amount = Number(item.total_amount || 0);

      return {
        material_type_id: item.material_type_id,
        material_type: item.material_type,
        total_amount: amount.toFixed(2),

        percentage:
          grandTotal > 0
            ? ((amount / grandTotal) * 100).toFixed(2)
            : "0.00",
      };
    });

    return commonService.okResponse(res, {
      total_amount: grandTotal.toFixed(2),

      statistics: formatted,
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

const getQuotationDashboard = async (req, res) => {
  try {
    const { branch_id, year, from_date, to_date, date_filter, vendor_id } =
      req.query;

    let replacements = {};

    let quotationWhere = ` WHERE q.deleted_at IS NULL `;
    let salesOrderWhere = ` WHERE po.deleted_at IS NULL `;

    // BRANCH FILTER
    if (branch_id) {
      quotationWhere += ` AND q.branch_id = :branch_id `;
      salesOrderWhere += ` AND po.branch_id = :branch_id `;
      replacements.branch_id = branch_id;
    }

    // VENDOR FILTER
    if (vendor_id) {
      quotationWhere += `
    AND EXISTS (
      SELECT 1
      FROM vendor_quotations vq
      WHERE vq.quotation_id = q.id
      AND vq.vendor_id = :vendor_id
      AND vq.deleted_at IS NULL
    )
  `;
      salesOrderWhere += `
    AND po.vendor_id = :vendor_id
  `;
      replacements.vendor_id = vendor_id;
    }

    // YEAR FILTER
    if (year) {
      quotationWhere += `
        AND EXTRACT(YEAR FROM q.request_date) = :year
      `;

      salesOrderWhere += `
        AND EXTRACT(YEAR FROM po.created_at) = :year
      `;

      replacements.year = parseInt(year);
    }

    // DATE FILTER
    const quotationDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "q.request_date",
      replacements,
    );

    const salesOrderDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "po.created_at",
      replacements,
    );

    quotationWhere += quotationDateFilter;
    salesOrderWhere += salesOrderDateFilter;

    // SCORE CARDS
    const scoreCardQuery = `
      SELECT
        COUNT(*) FILTER (
          WHERE vq.status = 'pending'
        ) AS total_quotation_received,

        COUNT(*) FILTER (
          WHERE vq.status = 'rejected'
        ) AS rejected_quotation

      FROM vendor_quotations vq

      LEFT JOIN quotations q
        ON q.id = vq.quotation_id

      WHERE vq.deleted_at IS NULL
        AND vq.vendor_id = :vendor_id
    `;

    // SALES ORDER COUNT
    const salesOrderQuery = `
      SELECT
        COUNT(*) AS total_sales_order
      FROM purchase_orders po
      ${salesOrderWhere}
    `;

    // CONVERSION RATE GRAPH
    const conversionRateQuery = `
      WITH quotation_data AS (
        SELECT
          EXTRACT(MONTH FROM q.request_date) AS month_number,
          TO_CHAR(q.request_date, 'Mon') AS month,
          COUNT(q.id) AS quotation_count

        FROM quotations q

        ${quotationWhere}

        GROUP BY
          EXTRACT(MONTH FROM q.request_date),
          TO_CHAR(q.request_date, 'Mon')
      ),

      sales_order_data AS (
        SELECT
          EXTRACT(MONTH FROM po.created_at) AS month_number,
          COUNT(po.id) AS sales_order_count

        FROM purchase_orders po

        ${salesOrderWhere}

        GROUP BY
          EXTRACT(MONTH FROM po.created_at)
      )

      SELECT
        qd.month_number,
        qd.month,
        qd.quotation_count,
        COALESCE(sod.sales_order_count, 0) AS sales_order_count

      FROM quotation_data qd

      LEFT JOIN sales_order_data sod
        ON sod.month_number = qd.month_number

      ORDER BY qd.month_number
    `;

    // QUOTATION RECEIVED TABLE
    const quotationReceivedQuery = `
      SELECT
        q.id,
        q.request_date,
        q.qr_id,
        q.expiry_date,

        STRING_AGG(
          DISTINCT c.category_name,
          ', '
        ) AS item_details,

        COALESCE(SUM(qi.quantity),0) AS quantity,

        CASE
          WHEN q.status_id = 1 THEN 'Pending'
          WHEN q.status_id = 2 THEN 'Partially Received'
          WHEN q.status_id = 3 THEN 'Received'
          WHEN q.status_id = 4 THEN 'Rejected'
        END AS status

      FROM quotations q

      LEFT JOIN quotation_items qi
        ON qi.quotation_id = q.id
        AND qi.deleted_at IS NULL
        AND qi.vendor_quotation_id IS NULL

      LEFT JOIN categories c
        ON c.id = qi.category_id

      ${quotationWhere}

      GROUP BY q.id

      ORDER BY q.created_at DESC
    `;

    // EXECUTE ALL

    const [scoreCards, salesOrders, conversionRate, quotationReceived] =
      await Promise.all([
        sequelize.query(scoreCardQuery, {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }),

        sequelize.query(salesOrderQuery, {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }),

        sequelize.query(conversionRateQuery, {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }),

        sequelize.query(quotationReceivedQuery, {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }),
      ]);

    return commonService.okResponse(res, {
      score_cards: {
        total_quotation_received: Number(
          scoreCards[0]?.total_quotation_received || 0,
        ),

        total_sales_order: Number(salesOrders[0]?.total_sales_order || 0),

        rejected_quotation: Number(scoreCards[0]?.rejected_quotation || 0),
      },

      conversion_rate: conversionRate.map((row) => ({
        month: row.month,
        quotation: Number(row.quotation_count || 0),
        sales_order: Number(row.sales_order_count || 0),
      })),

      quotation_received: quotationReceived,
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  getVendorRevenueStatistics,
  getQuotationDashboard,
};
