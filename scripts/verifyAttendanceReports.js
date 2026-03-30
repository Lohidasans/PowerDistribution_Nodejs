require('dotenv').config();
const { Sequelize } = require('sequelize');
const sq = new Sequelize(
    process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD,
    { host: process.env.DB_HOST, port: process.env.DB_PORT, dialect: 'postgres', logging: false }
);
async function run() {
    try {
        const counts = await sq.query(
            "SELECT status, COUNT(*) as cnt FROM employee_attendance_reports GROUP BY status ORDER BY cnt DESC",
            { type: Sequelize.QueryTypes.SELECT }
        );
        console.log('\n=== Status counts ===');
        counts.forEach(r => console.log(` ${r.status}: ${r.cnt} rows`));

        const dateRange = await sq.query(
            "SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT date) as days FROM employee_attendance_reports",
            { type: Sequelize.QueryTypes.SELECT }
        );
        console.log('\n=== Date range ===', JSON.stringify(dateRange[0]));

        const sample = await sq.query(
            "SELECT ear.*, e.employee_name FROM employee_attendance_reports ear JOIN employees e ON e.id = ear.employee_id WHERE ear.status = 'Present' LIMIT 5",
            { type: Sequelize.QueryTypes.SELECT }
        );
        console.log('\n=== Present sample ===');
        sample.forEach(r => console.log(` ${r.employee_name} | ${r.date} | in:${r.clock_in} out:${r.clock_out} | prod:${r.production_hours}h ot:${r.overtime_hours}h`));
    } catch (err) {
        console.error('ERROR:', err.message);
    } finally {
        await sq.close();
    }
}
run();
