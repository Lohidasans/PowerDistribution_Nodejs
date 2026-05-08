const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { dateFilter } = require("../helpers/dateHelper");

const getEmployeeWiseSalesReport = async (req, res) => {
  try {
    const { employee_id, branch_id, from_date, to_date, date_filter, year } =
      req.query;

    let replacements = {};

    let invoiceWhere = `
      WHERE sib.deleted_at IS NULL
      AND sib.status != 'Cancelled'
    `;

    let repairWhere = `
      WHERE jr.deleted_at IS NULL
      AND jr.status != 'Cancelled'
    `;

    // EMPLOYEE FILTER
    if (employee_id) {
      invoiceWhere += ` AND sib.employee_id = :employee_id `;
      repairWhere += ` AND jr.employee_id = :employee_id `;

      replacements.employee_id = employee_id;
    }

    // BRANCH FILTER
    if (branch_id) {
      invoiceWhere += ` AND sib.branch_id = :branch_id `;
      repairWhere += ` AND jr.branch_id = :branch_id `;

      replacements.branch_id = branch_id;
    }

    // YEAR FILTER
    if (year) {
      invoiceWhere += `
        AND EXTRACT(YEAR FROM sib.invoice_date) = :year
      `;

      repairWhere += `
        AND EXTRACT(YEAR FROM jr.date) = :year
      `;

      replacements.year = parseInt(year);
    }

    // DATE FILTER
    const invoiceDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "sib.invoice_date",
      replacements,
    );

    const repairDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "jr.date",
      replacements,
    );

    invoiceWhere += invoiceDateFilter;
    repairWhere += repairDateFilter;

    // MONTH WISE SALES
    const salesReportQuery = `
      WITH invoice_sales AS (

        SELECT
          EXTRACT(MONTH FROM sib.invoice_date) AS month_number,
          TO_CHAR(sib.invoice_date, 'Mon') AS month,

          COALESCE(SUM(sib.total_amount), 0) AS invoice_amount

        FROM sales_invoice_bills sib

        ${invoiceWhere}

        GROUP BY
          EXTRACT(MONTH FROM sib.invoice_date),
          TO_CHAR(sib.invoice_date, 'Mon')
      ),

      repair_sales AS (

        SELECT
          EXTRACT(MONTH FROM jr.date) AS month_number,
          TO_CHAR(jr.date, 'Mon') AS month,

          COALESCE(SUM(jr.total_amount), 0) AS repair_amount

        FROM jewel_repairs jr

        ${repairWhere}

        GROUP BY
          EXTRACT(MONTH FROM jr.date),
          TO_CHAR(jr.date, 'Mon')
      )

      SELECT
        COALESCE(i.month_number, r.month_number) AS month_number,

        COALESCE(i.month, r.month) AS month,

        COALESCE(i.invoice_amount, 0) AS invoice_sales,

        COALESCE(r.repair_amount, 0) AS repair_sales,

        (
          COALESCE(i.invoice_amount, 0)
          +
          COALESCE(r.repair_amount, 0)
        ) AS total_sales

      FROM invoice_sales i

      FULL OUTER JOIN repair_sales r
        ON r.month_number = i.month_number

      ORDER BY month_number
    `;

    // SUMMARY CARD
    const summaryQuery = `
      SELECT
        (
          COALESCE((
            SELECT SUM(sib.total_amount)
            FROM sales_invoice_bills sib
            ${invoiceWhere}
          ), 0)

          +

          COALESCE((
            SELECT SUM(jr.total_amount)
            FROM jewel_repairs jr
            ${repairWhere}
          ), 0)

        ) AS total_sales,

        (
          COALESCE((
            SELECT COUNT(*)
            FROM sales_invoice_bills sib
            ${invoiceWhere}
          ), 0)

          +

          COALESCE((
            SELECT COUNT(*)
            FROM jewel_repairs jr
            ${repairWhere}
          ), 0)

        ) AS total_transactions
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
      summary: {
        total_sales: Number(summary[0]?.total_sales || 0),
        total_transactions: Number(summary[0]?.total_transactions || 0),
      },

      monthly_sales_report: salesReport.map((row) => ({
        month: row.month,
        invoice_sales: Number(row.invoice_sales || 0),
        repair_sales: Number(row.repair_sales || 0),
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