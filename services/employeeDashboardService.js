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


// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE DASHBOARD STATS
// GET /api/v1/employee-dashboard/stats
// Query: employee_id (required), year (optional, defaults to current year)
// ─────────────────────────────────────────────────────────────────────────────
const getEmployeeDashboardStats = async (req, res) => {
  try {
    const { employee_id, year } = req.query;

    if (!employee_id) {
      return commonService.badRequest(res, "employee_id is required");
    }

    const empId = parseInt(employee_id, 10);
    if (isNaN(empId)) {
      return commonService.badRequest(res, "employee_id must be a valid number");
    }

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const selectedYear = year ? parseInt(year, 10) : currentYear;
    const currentMonthStr = `${currentYear}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

    // 1. Attendance score card (all-time, from joining date onwards)
    const attendanceQuery = `
      SELECT
        COUNT(*)                                           AS total_working_days,
        COUNT(*) FILTER (WHERE status = 'Present')        AS present,
        COUNT(*) FILTER (WHERE status = 'Absent')         AS absent
      FROM employee_attendance_reports
      WHERE employee_id = :employee_id
    `;

    // 2. Leave counts — approved (status_id = 2) leaves only
    //    Permission    → leave_type_name = 'Permission'      (id 19)
    //    Comp Off      → leave_type_name = 'Compensatory Off' (id 9)
    //    Leave Availed → all other approved leave types
    const leaveQuery = `
      SELECT
        COUNT(*) FILTER (
          WHERE lt.leave_type_name = 'Permission'
        ) AS permission,
        COUNT(*) FILTER (
          WHERE lt.leave_type_name = 'Compensatory Off'
        ) AS comp_off,
        COUNT(*) FILTER (
          WHERE lt.leave_type_name <> 'Permission'
            AND lt.leave_type_name <> 'Compensatory Off'
        ) AS leave_availed
      FROM leaves l
      JOIN leave_types lt ON lt.id = l.leave_type_id AND lt.deleted_at IS NULL
      WHERE l.employee_id = :employee_id
        AND l.status_id   = 2
        AND l.deleted_at  IS NULL
    `;

    // 3. Monthly incentive chart for the selected year
    //    Reads earning payroll items whose payroll_master name contains "incentive"
    const incentiveQuery = `
      SELECT
        p.pay_month,
        TO_CHAR(TO_DATE(p.pay_month, 'YYYY-MM'), 'Mon')          AS month_label,
        EXTRACT(MONTH FROM TO_DATE(p.pay_month, 'YYYY-MM'))::INT  AS month_number,
        COALESCE(SUM(pi.amount), 0)                              AS incentive_amount
      FROM payrolls p
      JOIN payroll_items pi
        ON pi.payroll_id = p.id AND pi.deleted_at IS NULL
      JOIN payroll_masters pm
        ON pm.id = pi.payroll_master_id AND pm.deleted_at IS NULL
      WHERE p.employee_id  = :employee_id
        AND p.deleted_at   IS NULL
        AND EXTRACT(YEAR FROM TO_DATE(p.pay_month, 'YYYY-MM')) = :year
        AND pi.item_type   = 'earning'
        AND LOWER(pm.pay_type_name) LIKE '%incentive%'
      GROUP BY p.pay_month
      ORDER BY p.pay_month
    `;

    const [attendanceResult, leaveResult, incentiveResult] = await Promise.all([
      sequelize.query(attendanceQuery, {
        replacements: { employee_id: empId },
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(leaveQuery, {
        replacements: { employee_id: empId },
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(incentiveQuery, {
        replacements: { employee_id: empId, year: selectedYear },
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    const attendance = attendanceResult[0] || {};
    const leave      = leaveResult[0]      || {};

    // Build a pay_month → amount lookup
    const incentiveMap = {};
    incentiveResult.forEach((row) => {
      incentiveMap[row.pay_month] = Number(row.incentive_amount || 0);
    });

    // Current month incentive (for the "This Month" label)
    const currentMonthAmount = incentiveMap[currentMonthStr] || 0;

    // Full 12-month chart data for selectedYear
    const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthlyData = MONTH_LABELS.map((label, idx) => {
      const key = `${selectedYear}-${String(idx + 1).padStart(2, "0")}`;
      return {
        month: label,
        month_number: idx + 1,
        amount: incentiveMap[key] || 0,
      };
    });

    return commonService.okResponse(res, {
      score_card: {
        total_working_days: Number(attendance.total_working_days || 0),
        present:            Number(attendance.present            || 0),
        absent:             Number(attendance.absent             || 0),
        leave: {
          permission:    Number(leave.permission    || 0),
          comp_off:      Number(leave.comp_off      || 0),
          leave_availed: Number(leave.leave_availed || 0),
        },
      },
      incentive_details: {
        year:                 selectedYear,
        current_month_amount: currentMonthAmount,
        monthly_data:         monthlyData,
      },
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports={
    getEmployeeWiseSalesReport,
    getEmployeeDashboardStats,
}