/**
 * One-time backfill: populate employee_attendance_reports
 * from historical employee_tracking data.
 *
 * Uses a DIRECT Sequelize connection (does NOT sync models) — safe to run
 * even while app.js is running.
 *
 * Usage:
 *   node scripts/backfillAttendanceReports.js                        → Previous month (default)
 *   node scripts/backfillAttendanceReports.js 2026-01-01 2026-01-31  → Custom date range
 *   node scripts/backfillAttendanceReports.js 2025-01-01 2026-02-28  → Multi-month range
 *
 * Safe to re-run → INSERT … ON CONFLICT DO UPDATE (upsert, no duplicates).
 */

require('dotenv').config();

const { Sequelize } = require('sequelize');
const moment = require('moment');

// ── Build DB connection from the same env vars your app uses ──────────────────
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host:    process.env.DB_HOST || 'localhost',
        port:    parseInt(process.env.DB_PORT || '5432', 10),
        dialect: 'postgres',
        logging: false,   // silent – change to console.log to debug SQL
    }
);

const OFFICE_START        = '10:30:00';
const OFFICE_END          = '20:30:00';
const STANDARD_WORK_HOURS = 10;

// ── Core upsert function ──────────────────────────────────────────────────────
async function upsertRange(startDate, endDate) {
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
              -- NOTE: No Active filter here — backfill captures ALL historical employees
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

                CASE WHEN dc.clock_in IS NOT NULL THEN 'Present' ELSE 'Absent' END AS status,

                dc.clock_in,
                dc.clock_out,

                ROUND(CAST(
                    CASE
                        WHEN dc.clock_in IS NOT NULL AND dc.clock_out IS NOT NULL THEN
                            EXTRACT(EPOCH FROM (dc.clock_out - dc.clock_in)) / 3600
                        ELSE 0
                    END
                AS NUMERIC), 2) AS total_hours,

                ROUND(CAST(
                    CASE
                        WHEN dc.clock_in IS NOT NULL AND wp.total_work_duration IS NOT NULL THEN
                            LEAST(wp.total_work_duration, :standard_hours)
                        ELSE 0
                    END
                AS NUMERIC), 2) AS production_hours,

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
            status::"enum_employee_attendance_reports_status",
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
            office_start:   OFFICE_START,
            office_end:     OFFICE_END,
            standard_hours: STANDARD_WORK_HOURS,
        },
        type: Sequelize.QueryTypes.RAW,
    });

    return (meta && meta.rowCount != null) ? meta.rowCount : 0;
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
    const nowIST = moment().utcOffset('+05:30');

    const fromArg = process.argv[2];
    const toArg   = process.argv[3];

    const startDate = fromArg || nowIST.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
    const endDate   = toArg   || nowIST.clone().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  📊  Employee Attendance Reports — Backfill Script');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Range  : ${startDate}  →  ${endDate}`);
    console.log(`  Time   : ${nowIST.format('YYYY-MM-DD HH:mm:ss')} IST`);
    console.log('  Mode   : UPSERT (safe to re-run, zero duplicates)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        console.log('⏳ Running upsert...');
        const rowCount = await upsertRange(startDate, endDate);

        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`  ✅  Rows inserted / updated : ${rowCount}`);
        console.log('═══════════════════════════════════════════════════════════');
        console.log('');
    } catch (err) {
        console.error('');
        console.error('❌  Backfill FAILED:', err.message);
        if (err.parent) console.error('   DB Error:', err.parent.message);
        process.exit(1);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

main();
