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
    } = req.query;

    let replacements = {};

    // WHERE CONDITIONS
    let invoiceWhere = `
      WHERE sib.deleted_at IS NULL
      AND sib.status = 'Invoice' AND sib.is_active = true
    `;

    // EMPLOYEE FILTER
    if (employee_id) {
      invoiceWhere += ` AND sib.employee_id = :employee_id`;
      replacements.employee_id = employee_id;
    }

    if (branch_id) {
      invoiceWhere += ` AND sib.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    if (year) {
      invoiceWhere += ` AND EXTRACT(YEAR FROM sib.invoice_date) = :year`;
      replacements.year = parseInt(year);
    }

    const invoiceDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "sib.invoice_date",
      replacements
    );

    invoiceWhere += invoiceDateFilter;

    // MONTH WISE SALES
    const salesReportQuery = `
      SELECT
        EXTRACT(MONTH FROM sib.invoice_date) AS month_number,
        TO_CHAR(sib.invoice_date, 'Mon') AS month,
        COALESCE(SUM(sib.total_amount), 0) AS total_sales
      FROM sales_invoice_bills sib
      ${invoiceWhere}

      GROUP BY
        EXTRACT(MONTH FROM sib.invoice_date),
        TO_CHAR(sib.invoice_date, 'Mon')

      ORDER BY month_number
    `;

    // SCORE CARD
    const summaryQuery = `
      SELECT
        COALESCE(SUM(sib.total_amount), 0) AS total_sales_value,
        COALESCE(SUM(sib.total_quantity), 0) AS total_sales_quantity,
        COALESCE(SUM(sibi.gross_weight * sibi.quantity), 0) AS total_sales_weight,
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
        total_value: Number(
          summary[0]?.total_sales_value || 0
        ),

        total_weight: Number(
          summary[0]?.total_sales_weight || 0
        ),

        total_quantity: Number(
          summary[0]?.total_sales_quantity || 0
        ),

        total_transactions: Number(
          summary[0]?.total_transactions || 0
        ),
      },

      monthly_sales_report: salesReport.map((row) => ({
        month: row.month,

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