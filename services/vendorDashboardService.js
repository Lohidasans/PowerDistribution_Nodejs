const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { dateFilter } = require("../helpers/dateHelper");

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
          WHERE q.status_id IN (2,3)
        ) AS total_quotation_received,

        COUNT(*) FILTER (
          WHERE q.status_id = 4
        ) AS rejected_quotation

      FROM quotations q
      ${quotationWhere}
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
  getQuotationDashboard,
};
