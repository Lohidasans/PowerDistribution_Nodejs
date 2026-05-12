const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { dateFilter } = require("../helpers/dateHelper");

const getEmployeeWiseSalesReport = async (req, res) => {
  try {
    const {
      employee_id,
      branch_id,
      from_date,
      to_date,
      date_filter,
      year,
      view_type = "month", // week | month | year
    } = req.query;

    let replacements = {};

    let invoiceWhere = `
      WHERE sib.deleted_at IS NULL
      AND sib.status = 'Invoice'
      AND sib.is_active = true
    `;

    // EMPLOYEE FILTER
    if (employee_id) {
      invoiceWhere += ` AND sib.employee_id = :employee_id`;
      replacements.employee_id = employee_id;
    }

    // BRANCH FILTER
    if (branch_id) {
      invoiceWhere += ` AND sib.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    // YEAR FILTER
    if (year) {
      invoiceWhere += ` AND EXTRACT(YEAR FROM sib.invoice_date) = :year`;
      replacements.year = parseInt(year);
    }

    // DATE FILTER
    const invoiceDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "sib.invoice_date",
      replacements
    );

    invoiceWhere += invoiceDateFilter;

    // DYNAMIC GROUPING
    let selectLabel = "";
    let groupBy = "";
    let orderBy = "";

    // WEEK VIEW
    if (view_type === "week") {
      selectLabel = `
        CONCAT(
          TO_CHAR(DATE_TRUNC('week', sib.invoice_date), 'DD Mon'),
          ' - ',
          TO_CHAR(DATE_TRUNC('week', sib.invoice_date) + INTERVAL '6 day', 'DD Mon')
        ) AS label
      `;

      groupBy = `
        DATE_TRUNC('week', sib.invoice_date)
      `;

      orderBy = `
        DATE_TRUNC('week', sib.invoice_date)
      `;
    }

    // YEAR VIEW
    else if (view_type === "year") {
      selectLabel = `
        EXTRACT(YEAR FROM sib.invoice_date) AS label
      `;

      groupBy = `
        EXTRACT(YEAR FROM sib.invoice_date)
      `;

      orderBy = `
        EXTRACT(YEAR FROM sib.invoice_date)
      `;
    }

    // MONTH VIEW (DEFAULT)
    else {
      selectLabel = `
        TO_CHAR(sib.invoice_date, 'Mon') AS label
      `;

      groupBy = `
        EXTRACT(MONTH FROM sib.invoice_date),
        TO_CHAR(sib.invoice_date, 'Mon')
      `;

      orderBy = `
        EXTRACT(MONTH FROM sib.invoice_date)
      `;
    }

    // SALES GRAPH QUERY
    const salesReportQuery = `
      SELECT
        ${selectLabel},
        COALESCE(SUM(sib.total_amount), 0) AS total_sales

      FROM sales_invoice_bills sib

      ${invoiceWhere}

      GROUP BY ${groupBy}

      ORDER BY ${orderBy}
    `;

    // SCORE CARD
    const summaryQuery = `
      SELECT
        COALESCE(SUM(sib.total_amount), 0) AS total_sales_value,
        COALESCE(SUM(sib.total_quantity), 0) AS total_sales_quantity,
        COALESCE(SUM(sibi.gross_weight * sibi.quantity),0) AS total_sales_weight,
        COUNT(DISTINCT sib.id) AS total_transactions
      FROM sales_invoice_bills sib
      LEFT JOIN sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.deleted_at IS NULL

      ${invoiceWhere}
    `;

    const [salesReport, summary] = await Promise.all([
      sequelize.query(salesReportQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),

      sequelize.query(summaryQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    return commonService.okResponse(res, {
      score_card: {
        total_value: Number(summary[0]?.total_sales_value || 0),

        total_weight: Number(summary[0]?.total_sales_weight || 0),

        total_quantity: Number(summary[0]?.total_sales_quantity || 0),

        total_transactions: Number(
          summary[0]?.total_transactions || 0
        ),
      },

      graph_type: view_type,

      sales_report: salesReport.map((row) => ({
        label: row.label,
        total_sales: Number(row.total_sales || 0),
      })),
    });

  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};


module.exports={
    getEmployeeWiseSalesReport,
}