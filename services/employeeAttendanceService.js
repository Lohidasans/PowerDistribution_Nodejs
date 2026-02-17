const { models, sequelize } = require("../models");
const { Op } = require("sequelize");
const commonService = require("./commonService");
const moment = require("moment");

/**
 * Calculate employee attendance with work hours, breaks, overtime, etc.
 * Based on office timings: 09:00 AM - 06:00 PM
 */
const getEmployeeAttendance = async (req, res) => {
  try {
    const {
      date,
      from_date,
      to_date,
      branch_id,
      department_id,
      role_id,
      employee_id,
      status, // Filter: Present, Absent, Overtime
      search // Search by employee name or number
    } = req.query;

    // Default to today if no date provided
    const targetDate = date || moment().format("YYYY-MM-DD");
    const startDate = from_date || targetDate;
    const endDate = to_date || targetDate;

    // Office timings configuration
    const OFFICE_START = "10:30:00";
    const OFFICE_END = "20:30:00"; // 08:30 PM in 24-hour format
    const STANDARD_WORK_HOURS = 10; // 10 hours (10:30 AM to 08:30 PM)

    let query = `
      WITH employee_list AS (
        SELECT 
          e.id,
          e.ref_employee_id,
          e.employee_no,
          e.employee_name,
          e.branch_id,
          e.department_id,
          e.role_id,
          b.branch_name,
          d.department_name,
          r.role_name as designation_name,
          e.profile_image_url
        FROM employees e
        LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN employee_departments d ON d.id = e.department_id
        LEFT JOIN roles r ON r.id = e.role_id
        WHERE e.deleted_at IS NULL
          AND e.status = 'Active'
    `;

    const replacements = { startDate, endDate };

    // Apply filters
    if (branch_id) {
      query += ` AND e.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }
    if (department_id) {
      query += ` AND e.department_id = :department_id`;
      replacements.department_id = department_id;
    }
    if (role_id) {
      query += ` AND e.role_id = :role_id`;
      replacements.role_id = role_id;
    }
    if (employee_id) {
      query += ` AND e.id = :employee_id`;
      replacements.employee_id = employee_id;
    }
    if (search) {
      query += ` AND (e.employee_name ILIKE :search OR e.employee_no ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    query += `
      ),
      tracking_data AS (
        SELECT 
          et.ref_employee_id,
          et.date,
          et.time,
          et.status_id,
          ROW_NUMBER() OVER (PARTITION BY et.ref_employee_id, et.date ORDER BY et.time ASC) as row_num,
          COUNT(*) OVER (PARTITION BY et.ref_employee_id, et.date) as total_punches
        FROM employee_tracking et
        WHERE et.date BETWEEN :startDate AND :endDate
          AND et.status_id = 1
      ),
      punch_pairs AS (
        SELECT 
          ref_employee_id,
          date,
          time as start_time,
          LEAD(time) OVER (PARTITION BY ref_employee_id, date ORDER BY time) as end_time,
          row_num,
          total_punches
        FROM tracking_data
      ),
      work_periods AS (
        SELECT 
          ref_employee_id,
          date,
          SUM(
            CASE 
              WHEN row_num % 2 = 1 AND end_time IS NOT NULL THEN
                EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
              WHEN row_num % 2 = 1 AND end_time IS NULL AND total_punches % 2 = 1 AND date = CURRENT_DATE THEN
                EXTRACT(EPOCH FROM (CURRENT_TIME - start_time)) / 3600
              ELSE 0
            END
          ) as total_work_duration
        FROM punch_pairs
        GROUP BY ref_employee_id, date
      ),
      clock_times AS (
        SELECT 
          td.ref_employee_id,
          MIN(td.time) as clock_in,
          CASE 
            WHEN COUNT(DISTINCT td.time) > 1 THEN MAX(td.time)
            ELSE NULL
          END as clock_out
        FROM tracking_data td
        GROUP BY td.ref_employee_id
      ),
      employee_work_hours AS (
        SELECT 
          ref_employee_id,
          SUM(total_work_duration) as actual_work_hours
        FROM work_periods
        GROUP BY ref_employee_id
      )
      SELECT 
        el.*,
        ct.clock_in,
        ct.clock_out,
        CASE 
          WHEN ct.clock_in IS NOT NULL AND ct.clock_out IS NOT NULL THEN
            EXTRACT(EPOCH FROM (ct.clock_out - ct.clock_in)) / 3600
          WHEN ct.clock_in IS NOT NULL AND ct.clock_out IS NULL THEN
            EXTRACT(EPOCH FROM (CURRENT_TIME - ct.clock_in)) / 3600
          ELSE NULL
        END as total_hours,
        CASE 
          WHEN ct.clock_in IS NOT NULL THEN 'Present'
          ELSE 'Absent'
        END as status,
        CASE 
          WHEN ct.clock_in IS NOT NULL AND ct.clock_in > :office_start::time THEN
            EXTRACT(EPOCH FROM (ct.clock_in - :office_start::time)) / 3600
          ELSE 0
        END as late_by_hours,
        COALESCE(ewh.actual_work_hours, 0) as actual_work_hours,
        CASE 
          WHEN ct.clock_in IS NOT NULL AND ewh.actual_work_hours IS NOT NULL THEN
            LEAST(ewh.actual_work_hours, :standard_hours)
          ELSE 0
        END as production_hours,
        CASE 
          WHEN ct.clock_out IS NOT NULL AND ct.clock_out > :office_end::time THEN
            GREATEST(0, 
              EXTRACT(EPOCH FROM (ct.clock_out - :office_end::time)) / 3600 - 
              CASE WHEN ct.clock_in > :office_start::time THEN EXTRACT(EPOCH FROM (ct.clock_in - :office_start::time)) / 3600 ELSE 0 END
            )
          WHEN ct.clock_out IS NULL AND ct.clock_in IS NOT NULL AND CURRENT_TIME > :office_end::time THEN
            GREATEST(0, 
              EXTRACT(EPOCH FROM (CURRENT_TIME - :office_end::time)) / 3600 - 
              CASE WHEN ct.clock_in > :office_start::time THEN EXTRACT(EPOCH FROM (ct.clock_in - :office_start::time)) / 3600 ELSE 0 END
            )
          ELSE 0
        END as overtime_hours
      FROM employee_list el
      LEFT JOIN clock_times ct ON ct.ref_employee_id = el.ref_employee_id
      LEFT JOIN employee_work_hours ewh ON ewh.ref_employee_id = el.ref_employee_id
      ORDER BY el.employee_name ASC
    `;

    replacements.office_start = OFFICE_START;
    replacements.office_end = OFFICE_END;
    replacements.standard_hours = STANDARD_WORK_HOURS;

    const rows = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    let attendance = rows.map((row) => {
      const totalHours = row.total_hours || 0;
      const actualWorkHours = row.actual_work_hours || 0;
      const productionHours = row.production_hours || 0;
      const overtimeHours = row.overtime_hours || 0;
      const breakHours = Math.max(0, totalHours - actualWorkHours);

      return {
        employee_id: row.id,
        ref_employee_id: row.ref_employee_id,
        employee_no: row.employee_no,
        employee_name: row.employee_name,
        profile_image_url: row.profile_image_url,
        branch_name: row.branch_name,
        department_name: row.department_name,
        designation_name: row.designation_name,
        status: row.status,
        clock_in: row.clock_in ? moment(row.clock_in, "HH:mm:ss").format("hh:mm A") : null,
        clock_out: row.clock_out ? moment(row.clock_out, "HH:mm:ss").format("hh:mm A") : null,
        production_hours: formatHours(productionHours),
        break_hours: formatHours(breakHours),
        overtime_hours: formatHours(overtimeHours),
        total_hours: formatHours(totalHours),
        late_by: formatHours(row.late_by_hours || 0),
        has_overtime: overtimeHours > 0,
      };
    });

    // Apply status filter (Present, Absent, Overtime)
    if (status) {
      if (status === "Present") {
        attendance = attendance.filter((a) => a.status === "Present");
      } else if (status === "Absent") {
        attendance = attendance.filter((a) => a.status === "Absent");
      } else if (status === "Overtime") {
        attendance = attendance.filter((a) => a.has_overtime === true);
      }
    }

    // Calculate summary statistics
    const summary = {
      total_employees: rows.length,
      present_count: rows.filter((a) => a.status === "Present").length,
      absent_count: rows.filter((a) => a.status === "Absent").length,
      overtime_count: rows.filter((a) => (a.overtime_hours || 0) > 0).length,
      total_production_hours: attendance.reduce((sum, a) => sum + parseHours(a.production_hours), 0),
      total_overtime_hours: attendance.reduce((sum, a) => sum + parseHours(a.overtime_hours), 0),
      average_work_hours: attendance.length > 0
        ? attendance.reduce((sum, a) => sum + parseHours(a.total_hours), 0) / attendance.filter((a) => a.status === "Present").length || 0
        : 0,
    };

    return commonService.okResponse(res, {
      from_date: startDate,
      to_date: endDate,
      office_timings: {
        start: moment(OFFICE_START, "HH:mm:ss").format("hh:mm A"),
        end: moment(OFFICE_END, "HH:mm:ss").format("hh:mm A"),
        standard_hours: STANDARD_WORK_HOURS,
      },
      summary: {
        ...summary,
        total_production_hours: formatHours(summary.total_production_hours),
        total_overtime_hours: formatHours(summary.total_overtime_hours),
        average_work_hours: formatHours(summary.average_work_hours),
      },
      attendance,
    });
  } catch (err) {
    console.error("Error in getEmployeeAttendance:", err);
    return commonService.handleError(res, err);
  }
};

/**
 * Get attendance for a specific employee over a date range
 */
const getEmployeeAttendanceHistory = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { start_date, end_date, search, status } = req.query;

    if (!start_date || !end_date) {
      return commonService.badRequest(res, "start_date and end_date are required");
    }

    const OFFICE_START = "10:30:00";
    const OFFICE_END = "20:30:00";
    const STANDARD_WORK_HOURS = 10;

    const query = `
      WITH date_range AS (
        SELECT generate_series(
          :start_date::date,
          :end_date::date,
          '1 day'::interval
        )::date as date
      ),
      employee_info AS (
        SELECT 
          e.id,
          e.ref_employee_id,
          e.employee_no,
          e.employee_name,
          b.branch_name,
          d.department_name,
          r.role_name as designation_name
        FROM employees e
        LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN employee_departments d ON d.id = e.department_id
        LEFT JOIN roles r ON r.id = e.role_id
        WHERE e.id = :employee_id AND e.deleted_at IS NULL
      ),
      tracking_data AS (
        SELECT 
          et.ref_employee_id,
          et.date,
          et.time,
          ROW_NUMBER() OVER (PARTITION BY et.ref_employee_id, et.date ORDER BY et.time ASC) as row_num,
          COUNT(*) OVER (PARTITION BY et.ref_employee_id, et.date) as total_punches
        FROM employee_tracking et
        WHERE et.date BETWEEN :start_date AND :end_date
          AND et.status_id = 1
      ),
      punch_pairs AS (
        SELECT 
          ref_employee_id,
          date,
          time as start_time,
          LEAD(time) OVER (PARTITION BY ref_employee_id, date ORDER BY time) as end_time,
          row_num,
          total_punches
        FROM tracking_data
      ),
      work_periods AS (
        SELECT 
          ref_employee_id,
          date,
          SUM(
            CASE 
              WHEN row_num % 2 = 1 AND end_time IS NOT NULL THEN
                EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
              WHEN row_num % 2 = 1 AND end_time IS NULL AND total_punches % 2 = 1 AND date = CURRENT_DATE THEN
                EXTRACT(EPOCH FROM (CURRENT_TIME - start_time)) / 3600
              ELSE 0
            END
          ) as total_work_duration
        FROM punch_pairs
        GROUP BY ref_employee_id, date
      ),
      daily_attendance AS (
        SELECT 
          td.ref_employee_id,
          td.date,
          MIN(td.time) as clock_in,
          CASE 
            WHEN COUNT(DISTINCT td.time) > 1 THEN MAX(td.time)
            ELSE NULL
          END as clock_out
        FROM tracking_data td
        GROUP BY td.ref_employee_id, td.date
      )
      SELECT 
        ei.*,
        dr.date,
        da.clock_in,
        da.clock_out,
        CASE 
          WHEN da.clock_in IS NOT NULL AND da.clock_out IS NOT NULL THEN
            EXTRACT(EPOCH FROM (da.clock_out - da.clock_in)) / 3600
          WHEN da.clock_in IS NOT NULL AND da.clock_out IS NULL AND dr.date = CURRENT_DATE THEN
            EXTRACT(EPOCH FROM (CURRENT_TIME - da.clock_in)) / 3600
          ELSE NULL
        END as total_hours,
        CASE 
          WHEN da.clock_in IS NOT NULL THEN 'Present'
          ELSE 'Absent'
        END as status,
        CASE 
          WHEN da.clock_in IS NOT NULL AND da.clock_in > :office_start::time THEN
            EXTRACT(EPOCH FROM (da.clock_in - :office_start::time)) / 3600
          ELSE 0
        END as late_by_hours,
        COALESCE(wp.total_work_duration, 0) as actual_work_hours,
        CASE 
          WHEN da.clock_in IS NOT NULL AND wp.total_work_duration IS NOT NULL THEN
            LEAST(wp.total_work_duration, :standard_hours)
          ELSE 0
        END as production_hours,
        CASE 
          WHEN da.clock_out IS NOT NULL AND da.clock_out > :office_end::time THEN
            GREATEST(0, 
              EXTRACT(EPOCH FROM (da.clock_out - :office_end::time)) / 3600 - 
              CASE WHEN da.clock_in > :office_start::time THEN EXTRACT(EPOCH FROM (da.clock_in - :office_start::time)) / 3600 ELSE 0 END
            )
          WHEN da.clock_out IS NULL AND da.clock_in IS NOT NULL AND dr.date = CURRENT_DATE AND CURRENT_TIME > :office_end::time THEN
            GREATEST(0, 
              EXTRACT(EPOCH FROM (CURRENT_TIME - :office_end::time)) / 3600 - 
              CASE WHEN da.clock_in > :office_start::time THEN EXTRACT(EPOCH FROM (da.clock_in - :office_start::time)) / 3600 ELSE 0 END
            )
          ELSE 0
        END as overtime_hours
      FROM employee_info ei
      CROSS JOIN date_range dr
      LEFT JOIN daily_attendance da ON da.ref_employee_id = ei.ref_employee_id AND da.date = dr.date
      LEFT JOIN work_periods wp ON wp.ref_employee_id = ei.ref_employee_id AND wp.date = dr.date
      ORDER BY dr.date DESC
    `;

    const rows = await sequelize.query(query, {
      replacements: {
        employee_id,
        start_date,
        end_date,
        office_start: OFFICE_START,
        office_end: OFFICE_END,
        standard_hours: STANDARD_WORK_HOURS,
      },
      type: sequelize.QueryTypes.SELECT,
    });

    if (rows.length === 0) {
      return commonService.notFound(res, "Employee not found");
    }

    const employeeInfo = {
      employee_id: rows[0].id,
      employee_no: rows[0].employee_no,
      employee_name: rows[0].employee_name,
      branch_name: rows[0].branch_name,
      department_name: rows[0].department_name,
      designation_name: rows[0].designation_name,
    };

    let history = rows.map((row) => {
      const totalHours = row.total_hours || 0;
      const actualWorkHours = row.actual_work_hours || 0;
      const productionHours = row.production_hours || 0;
      const overtimeHours = row.overtime_hours || 0;
      const breakHours = Math.max(0, totalHours - actualWorkHours);

      return {
        date: moment(row.date).format("YYYY-MM-DD"),
        day: moment(row.date).format("dddd"),
        status: row.status,
        clock_in: row.clock_in ? moment(row.clock_in, "HH:mm:ss").format("hh:mm A") : null,
        clock_out: row.clock_out ? moment(row.clock_out, "HH:mm:ss").format("hh:mm A") : null,
        production_hours: formatHours(productionHours),
        break_hours: formatHours(breakHours),
        overtime_hours: formatHours(overtimeHours),
        total_hours: formatHours(totalHours),
        late_by: formatHours(row.late_by_hours || 0),
      };
    });

    // Apply filters
    if (status) {
      history = history.filter((h) => h.status === status);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      history = history.filter((h) =>
        h.date.includes(searchLower) ||
        h.day.toLowerCase().includes(searchLower)
      );
    }

    const presentDays = history.filter((h) => h.status === "Present").length;
    const totalProductionHours = history.reduce((sum, h) => sum + parseHours(h.production_hours), 0);
    const totalOvertimeHours = history.reduce((sum, h) => sum + parseHours(h.overtime_hours), 0);

    return commonService.okResponse(res, {
      employee: employeeInfo,
      period: {
        start_date,
        end_date,
        total_days: history.length,
        present_days: presentDays,
        absent_days: history.length - presentDays,
      },
      summary: {
        total_production_hours: formatHours(totalProductionHours),
        total_overtime_hours: formatHours(totalOvertimeHours),
        average_daily_hours: presentDays > 0 ? formatHours(totalProductionHours / presentDays) : "00h 00m",
      },
      history,
    });
  } catch (err) {
    console.error("Error in getEmployeeAttendanceHistory:", err);
    return commonService.handleError(res, err);
  }
};

/**
 * Get attendance summary/dashboard
 */
const getAttendanceSummary = async (req, res) => {
  try {
    const { date, branch_id } = req.query;
    const targetDate = date || moment().format("YYYY-MM-DD");

    let whereClause = "WHERE e.deleted_at IS NULL AND e.status = 'Active'";
    const replacements = { targetDate };

    if (branch_id) {
      whereClause += " AND e.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    const query = `
      WITH employee_count AS (
        SELECT COUNT(*) as total
        FROM employees e
        ${whereClause}
      ),
      attendance_today AS (
        SELECT 
          COUNT(DISTINCT et.ref_employee_id) as present,
          SUM(CASE WHEN et.status_id = 1 AND et.time > '09:00:00' THEN 1 ELSE 0 END) as late_arrivals
        FROM employee_tracking et
        INNER JOIN employees e ON e.ref_employee_id = et.ref_employee_id
        WHERE et.date = :targetDate
          ${branch_id ? 'AND e.branch_id = :branch_id' : ''}
      )
      SELECT 
        ec.total as total_employees,
        COALESCE(at.present, 0) as present_count,
        ec.total - COALESCE(at.present, 0) as absent_count,
        COALESCE(at.late_arrivals, 0) as late_arrivals,
        ROUND((COALESCE(at.present, 0)::numeric / NULLIF(ec.total, 0) * 100), 2) as attendance_percentage
      FROM employee_count ec
      CROSS JOIN attendance_today at
    `;

    const [summary] = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, {
      date: targetDate,
      summary: {
        total_employees: parseInt(summary.total_employees) || 0,
        present_count: parseInt(summary.present_count) || 0,
        absent_count: parseInt(summary.absent_count) || 0,
        late_arrivals: parseInt(summary.late_arrivals) || 0,
        attendance_percentage: parseFloat(summary.attendance_percentage) || 0,
      },
    });
  } catch (err) {
    console.error("Error in getAttendanceSummary:", err);
    return commonService.handleError(res, err);
  }
};

// Helper functions
function formatHours(hours) {
  if (!hours || hours === 0) return "00h 00m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function parseHours(formattedHours) {
  if (!formattedHours || formattedHours === "00h 00m") return 0;
  const match = formattedHours.match(/(\d+)h\s*(\d+)m/);
  if (!match) return 0;
  return parseInt(match[1]) + parseInt(match[2]) / 60;
}

module.exports = {
  getEmployeeAttendance,
  getEmployeeAttendanceHistory,
  getAttendanceSummary,
};
