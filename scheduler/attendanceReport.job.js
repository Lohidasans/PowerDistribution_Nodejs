'use strict';

const { sequelize } = require('../models');
const moment = require('moment');

const OFFICE_START = '10:30:00';
const OFFICE_END   = '20:30:00';
const STANDARD_WORK_HOURS = 10;

/**
 * Build & execute the INSERT … ON CONFLICT DO UPDATE upsert for a given date range.
 *
 * This mirrors the exact same CTE logic used in getEmployeeAttendance so numbers
 * are always consistent.  We use a raw INSERT … SELECT so the entire operation
 * is a single atomic SQL statement – no extra round-trips.
 *
 * @param {string} startDate  'YYYY-MM-DD'
 * @param {string} endDate    'YYYY-MM-DD'
 */
const upsertAttendanceReports = async (startDate, endDate) => {
    const sql = `
        INSERT INTO employee_attendance_reports
            (employee_id, ref_employee_id, date, status,
             clock_in, clock_out,
             break_hours, production_hours, overtime_hours,
             total_hours, late_by_hours,
             created_at, updated_at)

        WITH date_series AS (
            SELECT generate_series(:startDate::date, :endDate::date, '1 day'::interval)::date AS d
        ),
        employee_list AS (
            SELECT
                e.id              AS employee_id,
                e.ref_employee_id
            FROM employees e
            WHERE e.deleted_at IS NULL
              AND e.status = 'Active'
        ),
        tracking_data AS (
            SELECT
                et.ref_employee_id,
                et.date,
                et.time,
                ROW_NUMBER() OVER (PARTITION BY et.ref_employee_id, et.date ORDER BY et.time ASC) AS row_num,
                COUNT(*)        OVER (PARTITION BY et.ref_employee_id, et.date)                   AS total_punches
            FROM employee_tracking et
            WHERE et.date BETWEEN :startDate AND :endDate
              AND et.status_id = 1
        ),
        punch_pairs AS (
            SELECT
                ref_employee_id,
                date,
                time AS start_time,
                LEAD(time) OVER (PARTITION BY ref_employee_id, date ORDER BY time) AS end_time,
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
                        ELSE 0
                    END
                ) AS total_work_duration
            FROM punch_pairs
            GROUP BY ref_employee_id, date
        ),
        daily_clock AS (
            SELECT
                ref_employee_id,
                date,
                MIN(time) AS clock_in,
                CASE WHEN COUNT(DISTINCT time) > 1 THEN MAX(time) ELSE NULL END AS clock_out
            FROM tracking_data
            GROUP BY ref_employee_id, date
        ),
        computed AS (
            SELECT
                el.employee_id,
                el.ref_employee_id,
                ds.d AS date,

                -- status
                CASE WHEN dc.clock_in IS NOT NULL THEN 'Present' ELSE 'Absent' END AS status,

                -- raw clock times (stored as TIME)
                dc.clock_in,
                dc.clock_out,

                -- total_hours = clock_out - clock_in (decimal hrs)
                ROUND(CAST(
                    CASE
                        WHEN dc.clock_in IS NOT NULL AND dc.clock_out IS NOT NULL THEN
                            EXTRACT(EPOCH FROM (dc.clock_out - dc.clock_in)) / 3600
                        ELSE 0
                    END
                AS NUMERIC), 2) AS total_hours,

                -- production_hours = LEAST(actual_work, standard)
                ROUND(CAST(
                    CASE
                        WHEN dc.clock_in IS NOT NULL AND wp.total_work_duration IS NOT NULL THEN
                            LEAST(wp.total_work_duration, :standard_hours)
                        ELSE 0
                    END
                AS NUMERIC), 2) AS production_hours,

                -- break_hours = total - actual_work
                ROUND(CAST(
                    CASE
                        WHEN dc.clock_in IS NOT NULL THEN
                            GREATEST(0,
                                CASE
                                    WHEN dc.clock_in IS NOT NULL AND dc.clock_out IS NOT NULL THEN
                                        EXTRACT(EPOCH FROM (dc.clock_out - dc.clock_in)) / 3600
                                    ELSE 0
                                END
                                - COALESCE(wp.total_work_duration, 0)
                            )
                        ELSE 0
                    END
                AS NUMERIC), 2) AS break_hours,

                -- overtime_hours = hours beyond office end
                ROUND(CAST(
                    CASE
                        WHEN dc.clock_out IS NOT NULL AND dc.clock_out > :office_end::time THEN
                            GREATEST(0,
                                EXTRACT(EPOCH FROM (dc.clock_out - :office_end::time)) / 3600
                                - CASE WHEN dc.clock_in > :office_start::time
                                       THEN EXTRACT(EPOCH FROM (dc.clock_in - :office_start::time)) / 3600
                                       ELSE 0 END
                            )
                        ELSE 0
                    END
                AS NUMERIC), 2) AS overtime_hours,

                -- late_by_hours
                ROUND(CAST(
                    CASE
                        WHEN dc.clock_in IS NOT NULL AND dc.clock_in > :office_start::time THEN
                            EXTRACT(EPOCH FROM (dc.clock_in - :office_start::time)) / 3600
                        ELSE 0
                    END
                AS NUMERIC), 2) AS late_by_hours

            FROM employee_list el
            CROSS JOIN date_series ds
            LEFT JOIN daily_clock  dc ON dc.ref_employee_id = el.ref_employee_id AND dc.date = ds.d
            LEFT JOIN work_periods wp ON wp.ref_employee_id = el.ref_employee_id AND wp.date = ds.d
        )
        SELECT
            employee_id,
            ref_employee_id,
            date,
            status::\"enum_employee_attendance_reports_status\",
            clock_in,
            clock_out,
            break_hours,
            production_hours,
            overtime_hours,
            total_hours,
            late_by_hours,
            NOW() AS created_at,
            NOW() AS updated_at
        FROM computed

        ON CONFLICT (employee_id, date)
        DO UPDATE SET
            ref_employee_id  = EXCLUDED.ref_employee_id,
            status           = EXCLUDED.status,
            clock_in         = EXCLUDED.clock_in,
            clock_out        = EXCLUDED.clock_out,
            break_hours      = EXCLUDED.break_hours,
            production_hours = EXCLUDED.production_hours,
            overtime_hours   = EXCLUDED.overtime_hours,
            total_hours      = EXCLUDED.total_hours,
            late_by_hours    = EXCLUDED.late_by_hours,
            updated_at       = NOW()
    `;

    const [, meta] = await sequelize.query(sql, {
        replacements: {
            startDate,
            endDate,
            office_start: OFFICE_START,
            office_end:   OFFICE_END,
            standard_hours: STANDARD_WORK_HOURS,
        },
        type: sequelize.QueryTypes.RAW,
    });

    // meta.rowCount is available in Postgres
    const rows = (meta && meta.rowCount) ? meta.rowCount : '?';
    return rows;
};

/* ─────────────────────────────────────────────────────────────────────────────
   NIGHTLY JOB  – runs at 23:30 IST every day
   Records yesterday's attendance (avoids race conditions with late punches).
   ───────────────────────────────────────────────────────────────────────────── */
const runDailyAttendanceReport = async () => {
    const nowIST      = moment().utcOffset('+05:30');
    // Snapshot yesterday's date so even late punches (before 23:30) are captured
    const targetDate  = nowIST.clone().subtract(1, 'day').format('YYYY-MM-DD');

    console.log(`📋 [AttendanceReport] Nightly job started at ${nowIST.format()} | Processing: ${targetDate}`);

    try {
        const count = await upsertAttendanceReports(targetDate, targetDate);
        console.log(`✅ [AttendanceReport] Nightly job done | Rows upserted: ${count}`);
    } catch (err) {
        console.error('❌ [AttendanceReport] Nightly job FAILED:', err.message);
        throw err;
    }
};

/* ─────────────────────────────────────────────────────────────────────────────
   BACKFILL HELPER  – call once to populate previous-month (or any range) data.

   Usage from code:
       const { backfillAttendanceReports } = require('./attendanceReport.job');
       await backfillAttendanceReports();           // previous month (default)
       await backfillAttendanceReports('2026-01-01', '2026-01-31');  // custom
   ───────────────────────────────────────────────────────────────────────────── */
const backfillAttendanceReports = async (fromDate = null, toDate = null) => {
    const nowIST = moment().utcOffset('+05:30');

    // Default: entire previous calendar month
    const start = fromDate || nowIST.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const end   = toDate   || nowIST.clone().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');

    console.log(`🔄 [AttendanceReport] Backfill started | Range: ${start} → ${end}`);

    try {
        const count = await upsertAttendanceReports(start, end);
        console.log(`✅ [AttendanceReport] Backfill done | Rows upserted: ${count}`);
        return { success: true, start, end, rows: count };
    } catch (err) {
        console.error('❌ [AttendanceReport] Backfill FAILED:', err.message);
        throw err;
    }
};

module.exports = {
    runDailyAttendanceReport,
    backfillAttendanceReports,
};
