// scheduler.js
const cron = require('node-cron');
const deleteExpiredOnHoldInvoices = require('./onHoldInvoiceCleanup.job');

console.log("🕒 Scheduler loaded at", new Date());

// Runs once every day at 12:00 AM UTC
cron.schedule('0 0 * * *', async () => {
    console.log("🔄 Daily cron job started at", new Date());
    await deleteExpiredOnHoldInvoices();
    console.log("✅ Daily cron job finished at", new Date());
});
