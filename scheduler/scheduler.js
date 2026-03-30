// scheduler.js
const cron = require('node-cron');
const deleteExpiredOnHoldInvoices = require('./onHoldInvoiceCleanup.job');
const autoGenerateMonthlyPayroll  = require('./autoPayroll.job');
const { runDailyAttendanceReport }  = require('./attendanceReport.job');

console.log("🕒 Scheduler loaded at", new Date());

// Runs once every day at 12:00 AM UTC
cron.schedule('0 0 * * *', async () => {
    console.log("🔄 Daily cron job started at", new Date());
    await deleteExpiredOnHoldInvoices();
    console.log("✅ Daily cron job finished at", new Date());
});

// Auto-generate payroll on the 1st of every month at 00:30 AM
// Processes the PREVIOUS month for all active employees
cron.schedule('30 0 1 * *', async () => {
    console.log("💰 Monthly payroll auto-generation started at", new Date());
    await autoGenerateMonthlyPayroll();
}, {
    timezone: "Asia/Kolkata"  // IST
});

// Nightly attendance snapshot at 11:30 PM IST (Kolkata)
// Records YESTERDAY's date so all late punches are captured before the snapshot.
cron.schedule('30 23 * * *', async () => {
    console.log("📋 Nightly attendance report cron triggered at", new Date());
    await runDailyAttendanceReport();
}, {
    timezone: "Asia/Kolkata"  // IST
});
