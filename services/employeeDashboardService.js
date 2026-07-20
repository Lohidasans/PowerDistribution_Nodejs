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
        COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0) AS total_sales

      FROM sales_invoice_bills sib
      LEFT JOIN sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.deleted_at IS NULL

      ${invoiceWhere}

      GROUP BY ${groupBy}

      ORDER BY ${orderBy}
    `;

    // SCORE CARD
    const summaryQuery = `
      SELECT
        COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0) AS total_sales_value,
        COALESCE(SUM(sibi.quantity - COALESCE(sibi.returned_quantity, 0)), 0) AS total_sales_quantity,
        COALESCE(SUM(sibi.gross_weight * (sibi.quantity - COALESCE(sibi.returned_quantity, 0))),0) AS total_sales_weight,
        COUNT(DISTINCT sib.id) AS total_transactions
      FROM sales_invoice_bills sib
      LEFT JOIN sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.deleted_at IS NULL

      ${invoiceWhere}
    `;

    // Average Customer per day - Branch Admin
    let customerFlowWhere = `
      WHERE sib.deleted_at IS NULL
      AND sib.status = 'Invoice'
      AND sib.is_active = true

      -- Current Week (Monday -> Sunday)
      AND sib.invoice_date::date >= DATE_TRUNC('week', CURRENT_DATE)::date
      AND sib.invoice_date::date < (
        DATE_TRUNC('week', CURRENT_DATE)::date + INTERVAL '7 day'
      )
    `;

    if (branch_id) {
      customerFlowWhere += ` AND sib.branch_id = :branch_id`;
    }
    
    const customerFlowQuery = `
      SELECT
        TO_CHAR(sib.invoice_date, 'Dy') AS label,
        COUNT(DISTINCT sib.customer_id) AS customer_count,
        EXTRACT(ISODOW FROM sib.invoice_date) AS day_order

      FROM sales_invoice_bills sib
      
      ${customerFlowWhere}
      
      GROUP BY day_order, TO_CHAR(sib.invoice_date, 'Dy')

      ORDER BY day_order
    `;

    const [salesReport, summary, customerFlow] = await Promise.all([
      sequelize.query(salesReportQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),

      sequelize.query(summaryQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),

      sequelize.query(customerFlowQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    return commonService.okResponse(res, {
      score_card: {
        total_value: Number(summary[0]?.total_sales_value || 0),
        total_weight: Number(summary[0]?.total_sales_weight || 0),
        total_quantity: Number(summary[0]?.total_sales_quantity || 0),
        total_transactions: Number(summary[0]?.total_transactions || 0),
      },
      graph_type: view_type,
      sales_report: salesReport.map((row) => ({
        label: row.label,
        total_sales: Number(row.total_sales || 0),
      })),
      average_customer_flow: customerFlow.map((row) => ({
        label: row.label,
        customer_count: Number(row.customer_count || 0),
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
// Query: employee_id (required), year (optional, defaults to current year),
//        from_date / to_date (optional, filters attendance & leave counts)
// ─────────────────────────────────────────────────────────────────────────────
const getEmployeeDashboardStats = async (req, res) => {
  try {
    const { employee_id, year, from_date, to_date } = req.query;

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

    // Use dateFilter helper for attendance and leave date range
    const attendanceReplacements = { employee_id: empId };
    const attendanceDateClause = dateFilter(
      { from_date, to_date, date_filter: req.query.date_filter },
      "ear.date",
      attendanceReplacements
    );

    const leaveReplacements = { employee_id: empId };
    const leaveDateClause = dateFilter(
      { from_date, to_date, date_filter: req.query.date_filter },
      "l.leave_date",
      leaveReplacements
    );

    // 1. Attendance score card
    const attendanceQuery = `
      SELECT
        COUNT(*)                                              AS total_working_days,
        COUNT(*) FILTER (WHERE ear.status = 'Present')       AS present,
        COUNT(*) FILTER (WHERE ear.status = 'Absent')        AS absent
      FROM employee_attendance_reports ear
      WHERE ear.employee_id = :employee_id
        ${attendanceDateClause}
    `;

    // 2. Leave counts — approved (status_id = 2) leaves only
    //    Permission    → leave_type_name = 'Permission'       (id 19)
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
        ${leaveDateClause}
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
        replacements: attendanceReplacements,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(leaveQuery, {
        replacements: leaveReplacements,
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

// ─────────────────────────────────────────────────────────────────────────────
// WORKING HOURS CHART
// GET /api/v1/employee-dashboard/working-hours
// Query: employee_id (required), view_type (week|month|year, default week),
//        from_date / to_date  OR  date_filter (today|week|month|year)
// ─────────────────────────────────────────────────────────────────────────────
const getWorkingHours = async (req, res) => {
  try {
    const {
      employee_id,
      view_type = "week",
      from_date,
      to_date,
      date_filter,
    } = req.query;

    if (!employee_id) {
      return commonService.badRequest(res, "employee_id is required");
    }

    const empId = parseInt(employee_id, 10);
    if (isNaN(empId)) {
      return commonService.badRequest(res, "employee_id must be a valid number");
    }

    // Default to current week Mon when no date params given
    let defaultFrom = null;
    if (!from_date && !date_filter) {
      const today = new Date();
      const day   = today.getDay();
      const diff  = today.getDate() - day + (day === 0 ? -6 : 1);
      defaultFrom = new Date(today.getFullYear(), today.getMonth(), diff)
        .toISOString()
        .split("T")[0];
    }

    const hoursReplacements = { employee_id: empId };
    const hoursDateClause = dateFilter(
      {
        from_date: from_date || defaultFrom,
        to_date,
        date_filter,
      },
      "ear.date",
      hoursReplacements
    );

    let selectLabel = "";
    let groupBy     = "";
    let orderBy     = "";

    if (view_type === "week") {
      selectLabel = `
        TO_CHAR(ear.date, 'Dy') AS label,
        ear.date                AS raw_date
      `;
      groupBy = `ear.date`;
      orderBy = `ear.date`;
    } else if (view_type === "month") {
      selectLabel = `
        TO_CHAR(ear.date, 'DD Mon') AS label,
        ear.date                    AS raw_date
      `;
      groupBy = `ear.date`;
      orderBy = `ear.date`;
    } else {
      // year view — group by month
      selectLabel = `
        TO_CHAR(DATE_TRUNC('month', ear.date), 'Mon YYYY') AS label,
        DATE_TRUNC('month', ear.date)                       AS raw_date
      `;
      groupBy = `DATE_TRUNC('month', ear.date)`;
      orderBy = `DATE_TRUNC('month', ear.date)`;
    }

    const query = `
      SELECT
        ${selectLabel},
        COALESCE(SUM(ear.total_hours), 0)      AS total_hours,
        COALESCE(SUM(ear.production_hours), 0) AS production_hours,
        COALESCE(SUM(ear.overtime_hours), 0)   AS overtime_hours
      FROM employee_attendance_reports ear
      WHERE ear.employee_id = :employee_id
        ${hoursDateClause}
      GROUP BY ${groupBy}
      ORDER BY ${orderBy}
    `;

    const rows = await sequelize.query(query, {
      replacements: hoursReplacements,
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, {
      view_type,
      working_hours: rows.map((r) => ({
        label:            r.label,
        total_hours:      Number(r.total_hours      || 0),
        production_hours: Number(r.production_hours || 0),
        overtime_hours:   Number(r.overtime_hours   || 0),
      })),
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OUT-OF-OFFICE ALERTS (Upcoming / current-year holidays)
// GET /api/v1/employee-dashboard/out-of-office-alerts
// Query: branch_id (optional), year (optional, defaults to current year)
// ─────────────────────────────────────────────────────────────────────────────
const getOutOfOfficeAlerts = async (req, res) => {
  try {
    const { branch_id, year } = req.query;

    const currentYear = new Date().getFullYear();
    const selectedYear = year ? parseInt(year, 10) : currentYear;

    const replacements = { year: selectedYear };
    let branchFilter = "";
    if (branch_id) {
      branchFilter = `AND (h.branch_id = :branch_id OR h.branch_id IS NULL)`;
      replacements.branch_id = parseInt(branch_id, 10);
    }

    const query = `
      SELECT
        h.id,
        h.holiday_name  AS leave_name,
        TO_CHAR(h.holiday_date, 'DD/MM/YYYY') AS date,
        h.holiday_date,
        h.description
      FROM holidays h
      WHERE h.deleted_at IS NULL
        AND EXTRACT(YEAR FROM h.holiday_date) = :year
        ${branchFilter}
      ORDER BY h.holiday_date ASC
    `;

    const holidays = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, { holidays });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports={
    getEmployeeWiseSalesReport,
    getEmployeeDashboardStats,
    getWorkingHours,
    getOutOfOfficeAlerts,
}