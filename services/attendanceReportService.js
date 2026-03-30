const { sequelize } = require('../models');
const commonService = require('./commonService');
const moment = require('moment');

// leave_type_id that represents Comp-Off
const CO_LEAVE_TYPE_ID = 9;

/**
 * GET /api/v1/attendance/reports
 *
 * Returns a PIVOTED attendance report from employee_attendance_reports.
 * Each employee is one row; each date in the range is a column group
 * containing: status (P/A), clock_in, clock_out, break_hours, overtime_hours, production_hours.
 *
 * Query params:
 *   month        – 'YYYY-MM'  (e.g. 2026-02)  → sets full month range
 *   from_date    – 'YYYY-MM-DD'                 (overrides month start)
 *   to_date      – 'YYYY-MM-DD'                 (overrides month end)
 *   branch_id    – integer
 *   employee_id  – integer
 *   search       – string (match employee_name or employee_no)
 */
const getAttendanceReport = async (req, res) => {
    try {
        const { month, from_date, to_date, branch_id, employee_id, search } = req.query;

        // ── Resolve date range ────────────────────────────────────────────────
        let startDate, endDate;

        if (month) {
            // month = 'YYYY-MM'
            const m = moment(month, 'YYYY-MM', true);
            if (!m.isValid()) {
                return commonService.badRequest(res, 'Invalid month format. Use YYYY-MM (e.g. 2026-02)');
            }
            startDate = m.startOf('month').format('YYYY-MM-DD');
            endDate   = m.endOf('month').format('YYYY-MM-DD');
        } else if (from_date && to_date) {
            startDate = from_date;
            endDate   = to_date;
        } else if (from_date) {
            startDate = from_date;
            endDate   = from_date;
        } else {
            // Default: current month
            const now = moment().utcOffset('+05:30');
            startDate = now.clone().startOf('month').format('YYYY-MM-DD');
            endDate   = now.clone().endOf('month').format('YYYY-MM-DD');
        }

        // ── Build employee filter conditions ──────────────────────────────────
        let empWhere = `e.deleted_at IS NULL`;
        const replacements = { startDate, endDate };

        if (branch_id) {
            empWhere += ` AND e.branch_id = :branch_id`;
            replacements.branch_id = parseInt(branch_id, 10);
        }
        if (employee_id) {
            empWhere += ` AND e.id = :employee_id`;
            replacements.employee_id = parseInt(employee_id, 10);
        }
        if (search) {
            empWhere += ` AND (e.employee_name ILIKE :search OR e.employee_no ILIKE :search)`;
            replacements.search = `%${search}%`;
        }

        // ── Main query: fetch flat rows from employee_attendance_reports ───────
        // LEFT JOIN leaves for the same date range to detect L / CO status.
        // Leave priority (only for absent days): CO (type_id=9) > L (any other approved leave) > A
        const sql = `
            SELECT
                e.id              AS employee_id,
                e.employee_no,
                e.employee_name,
                e.profile_image_url,
                b.branch_name,
                d.department_name,
                r.role_name       AS designation_name,
                ear.date,
                ear.status,
                ear.clock_in,
                ear.clock_out,
                ear.break_hours,
                ear.production_hours,
                ear.overtime_hours,
                ear.total_hours,
                ear.late_by_hours,
                lv.leave_type_id,
                lv.status_id      AS leave_status_id
            FROM employees e
            LEFT JOIN branches             b   ON b.id  = e.branch_id
            LEFT JOIN employee_departments d   ON d.id  = e.department_id
            LEFT JOIN roles                r   ON r.id  = e.role_id
            LEFT JOIN employee_attendance_reports ear
                   ON ear.employee_id = e.id
                  AND ear.date BETWEEN :startDate AND :endDate
            LEFT JOIN leaves lv
                   ON lv.employee_id = e.id
                  AND lv.leave_date  = ear.date
                  AND lv.deleted_at IS NULL
            WHERE ${empWhere}
            ORDER BY e.employee_name ASC, ear.date ASC
        `;

        const rows = await sequelize.query(sql, {
            replacements,
            type: sequelize.QueryTypes.SELECT,
        });

        if (!rows.length) {
            return commonService.okResponse(res, {
                period: { from_date: startDate, to_date: endDate },
                dates: [],
                total_employees: 0,
                employees: [],
            });
        }

        // ── Build sorted list of all dates in range ───────────────────────────
        const dateList = [];
        const cur = moment(startDate);
        const end = moment(endDate);
        while (cur.isSameOrBefore(end, 'day')) {
            dateList.push(cur.format('YYYY-MM-DD'));
            cur.add(1, 'day');
        }

        // ── Pivot: group rows by employee ─────────────────────────────────────
        const employeeMap = new Map();

        for (const row of rows) {
            if (!employeeMap.has(row.employee_id)) {
                employeeMap.set(row.employee_id, {
                    employee_id:      row.employee_id,
                    employee_no:      row.employee_no,
                    employee_name:    row.employee_name,
                    profile_image_url: row.profile_image_url,
                    branch_name:      row.branch_name,
                    department_name:  row.department_name,
                    designation_name: row.designation_name,
                    attendance:       {},   // keyed by date string
                });
            }

            if (row.date) {
                const dateKey = moment(row.date).format('YYYY-MM-DD');
                const resolvedStatus = resolveStatus(
                    row.status,
                    row.leave_type_id,
                    row.leave_status_id
                );
                employeeMap.get(row.employee_id).attendance[dateKey] = {
                    status:           resolvedStatus.full,          // 'Present'|'CO'|'Leave'|'Absent'
                    status_short:     resolvedStatus.short,         // P | CO | L | A
                    clock_in:         row.clock_in  ? formatTime(row.clock_in)  : null,
                    clock_out:        row.clock_out ? formatTime(row.clock_out) : null,
                    break_hours:      formatDecimalHours(row.break_hours),
                    production_hours: formatDecimalHours(row.production_hours),
                    overtime_hours:   formatDecimalHours(row.overtime_hours),
                    total_hours:      formatDecimalHours(row.total_hours),
                    late_by_hours:    formatDecimalHours(row.late_by_hours),
                    leave_type_id:    row.leave_type_id   || null,
                    leave_status_id:  row.leave_status_id || null,
                };
            }
        }

        // ── Build final employee list with summary totals ─────────────────────
        let serialNo = 1;
        const employees = [];

        for (const [, emp] of employeeMap) {
            let presentDays = 0;
            let absentDays  = 0;
            let leaveDays   = 0;
            let coDays      = 0;
            let totalProdMinutes = 0;
            let totalOTMinutes   = 0;

            // Ensure every date in range exists (fill missing dates as Absent)
            for (const d of dateList) {
                if (!emp.attendance[d]) {
                    emp.attendance[d] = {
                        status:           'Absent',
                        status_short:     'A',
                        clock_in:         null,
                        clock_out:        null,
                        break_hours:      '0:00',
                        production_hours: '0:00',
                        overtime_hours:   '0:00',
                        total_hours:      '0:00',
                        late_by_hours:    '0:00',
                        leave_type_id:    null,
                        leave_status_id:  null,
                    };
                }

                const a = emp.attendance[d];
                if (a.status === 'Present') {
                    presentDays++;
                    totalProdMinutes += timeStringToMinutes(a.production_hours);
                    totalOTMinutes   += timeStringToMinutes(a.overtime_hours);
                } else if (a.status_short === 'CO') {
                    coDays++;
                } else if (a.status_short === 'L') {
                    leaveDays++;
                } else {
                    absentDays++;
                }
            }

            employees.push({
                s_no:             serialNo++,
                employee_id:      emp.employee_id,
                employee_no:      emp.employee_no,
                employee_name:    emp.employee_name,
                profile_image_url: emp.profile_image_url,
                branch_name:      emp.branch_name,
                department_name:  emp.department_name,
                designation_name: emp.designation_name,
                attendance:       emp.attendance,
                summary: {
                    present_days:            presentDays,
                    absent_days:             absentDays,
                    leave_days:              leaveDays,
                    co_days:                 coDays,
                    total_working_days:      dateList.length,
                    total_production_hours:  minutesToTimeString(totalProdMinutes),
                    total_overtime_hours:    minutesToTimeString(totalOTMinutes),
                },
            });
        }

        // ── Build date header metadata (for table columns) ────────────────────
        const dateHeaders = dateList.map(d => ({
            date:      d,
            day_short: moment(d).format('ddd'),   // Mon, Tue…
            day_full:  moment(d).format('dddd'),
            label:     moment(d).format('MMM D, ddd'), // Feb 12, Thu
        }));

        // ── Overall summary ───────────────────────────────────────────────────
        const totalPresent = employees.reduce((s, e) => s + e.summary.present_days, 0);
        const totalAbsent  = employees.reduce((s, e) => s + e.summary.absent_days,  0);
        const totalLeave   = employees.reduce((s, e) => s + e.summary.leave_days,   0);
        const totalCO      = employees.reduce((s, e) => s + e.summary.co_days,      0);

        return commonService.okResponse(res, {
            period: {
                from_date:  startDate,
                to_date:    endDate,
                total_days: dateList.length,
            },
            summary: {
                total_employees:         employees.length,
                total_present_records:   totalPresent,
                total_absent_records:    totalAbsent,
                total_leave_records:     totalLeave,
                total_co_records:        totalCO,
            },
            date_headers: dateHeaders,
            employees,
        });

    } catch (err) {
        console.error('Error in getAttendanceReport:', err);
        return commonService.handleError(res, err);
    }
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve the final display status for one attendance cell.
 *
 * Priority rules:
 *   1. If the employee was Present (has clock-in) → always P
 *   2. If absent BUT has an approved leave with leave_type_id = CO_LEAVE_TYPE_ID → CO
 *   3. If absent BUT has any other leave record → L
 *   4. Otherwise → A
 *
 * @param {string}  rawStatus       'Present' | 'Absent'  (from employee_attendance_reports)
 * @param {number}  leaveTypeId     leave_type_id from leaves table (null if no leave)
 * @param {number}  leaveStatusId   status_id from leaves table  (null if no leave)
 * @returns {{ full: string, short: string }}
 */
function resolveStatus(rawStatus, leaveTypeId, leaveStatusId) {
    // Present always wins
    if (rawStatus === 'Present') {
        return { full: 'Present', short: 'P' };
    }

    // Only mark leave if a leave record exists (any status_id — adjust if you
    // want only approved leaves by filtering leaveStatusId === 3)
    if (leaveTypeId != null) {
        if (parseInt(leaveTypeId, 10) === CO_LEAVE_TYPE_ID) {
            return { full: 'CO', short: 'CO' };
        }
        return { full: 'Leave', short: 'L' };
    }

    return { full: 'Absent', short: 'A' };
}

/** Format a Postgres TIME string 'HH:mm:ss' → 'HH:mm' */
function formatTime(t) {
    if (!t) return null;
    const parts = String(t).split(':');
    return `${parts[0]}:${parts[1]}`;
}

/**
 * Format DECIMAL hours (e.g. 1.50) → 'H:mm' (e.g. '1:30')
 * This is what the screenshot shows for BRK / OT / PH columns.
 */
function formatDecimalHours(val) {
    if (val === null || val === undefined) return '0:00';
    const num = parseFloat(val) || 0;
    if (num === 0) return '0:00';
    const h = Math.floor(num);
    const m = Math.round((num - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
}

/** 'H:mm' → total minutes (for summing) */
function timeStringToMinutes(str) {
    if (!str || str === '0:00') return 0;
    const [h, m] = str.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

/** total minutes → 'H:mm' */
function minutesToTimeString(mins) {
    if (!mins || mins === 0) return '0:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
}

module.exports = { getAttendanceReport };
