require('dotenv').config();
const { Sequelize } = require('sequelize');
const sq = new Sequelize(
    process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD,
    { host: process.env.DB_HOST, port: process.env.DB_PORT, dialect: 'postgres', logging: true }
);

async function run() {
    try {
        // Step 1: Would the computed CTE return any rows?
        const preview = await sq.query(`
            WITH date_series AS (
                SELECT generate_series('2026-02-12'::date, '2026-02-12'::date, '1 day'::interval)::date AS d
            ),
            employee_list AS (
                SELECT e.id AS employee_id, e.ref_employee_id
                FROM employees e
                WHERE e.deleted_at IS NULL
            ),
            tracking_data AS (
                SELECT et.ref_employee_id, et.date, et.time,
                    ROW_NUMBER() OVER (PARTITION BY et.ref_employee_id, et.date ORDER BY et.time ASC) AS row_num
                FROM employee_tracking et
                WHERE et.date BETWEEN '2026-02-12' AND '2026-02-12'
                  AND et.status_id = 1
            ),
            daily_clock AS (
                SELECT ref_employee_id, date,
                    MIN(time) AS clock_in,
                    CASE WHEN COUNT(DISTINCT time) > 1 THEN MAX(time) ELSE NULL END AS clock_out
                FROM tracking_data GROUP BY ref_employee_id, date
            )
            SELECT el.employee_id, el.ref_employee_id, ds.d AS date,
                CASE WHEN dc.clock_in IS NOT NULL THEN 'Present' ELSE 'Absent' END AS status,
                dc.clock_in, dc.clock_out
            FROM employee_list el
            CROSS JOIN date_series ds
            LEFT JOIN daily_clock dc ON dc.ref_employee_id = el.ref_employee_id AND dc.date = ds.d
            WHERE dc.clock_in IS NOT NULL   -- only Present rows for this test
            LIMIT 10
        `, { type: Sequelize.QueryTypes.SELECT });

        console.log('Present rows preview:', preview.length);
        console.log(JSON.stringify(preview, null, 2));

        // Step 2: Check enum type exists
        const enumCheck = await sq.query(
            "SELECT typname FROM pg_type WHERE typname = 'enum_employee_attendance_reports_status'",
            { type: Sequelize.QueryTypes.SELECT }
        );
        console.log('Enum type exists:', enumCheck.length > 0, enumCheck);

        // Step 3: Check table exists and row count
        const tableCheck = await sq.query(
            "SELECT COUNT(*) as cnt FROM employee_attendance_reports",
            { type: Sequelize.QueryTypes.SELECT }
        );
        console.log('Current rows in report table:', tableCheck[0]);

    } catch (err) {
        console.error('ERROR:', err.message);
        if (err.parent) console.error('PG ERROR:', err.parent.message);
    } finally {
        await sq.close();
    }
}
run();
