// scheduler.js
const cron = require('node-cron');
const deleteExpiredOnHoldInvoices = require('./onHoldInvoiceCleanup.job');

console.log("🕒 Scheduler loaded at", new Date());

// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    console.log("🔄 Cron job started at", new Date());
    await deleteExpiredOnHoldInvoices();
    console.log("✅ Cron job finished at", new Date());
});
