const { sequelize } = require('../models');

const deleteExpiredOnHoldInvoices = async () => {
    const transaction = await sequelize.transaction();

    try {
        console.log("*****Starting on-hold invoice cleanup job******");
        const expiredInvoices = await sequelize.query(
            `SELECT id
            FROM sales_invoice_bills
            WHERE status = 'On Hold'
                AND created_at <= NOW() - INTERVAL '24 HOURS'`,
            {
                type: sequelize.QueryTypes.SELECT,
                transaction
            }
        );

        if (!expiredInvoices.length) {
            await transaction.commit();
            console.log("✅ No expired invoices found");
            return;
        }

        const invoiceIds = expiredInvoices.map(i => i.id);

        await sequelize.query(
            `DELETE FROM sales_invoice_bills WHERE id IN (:ids)`,
            { replacements: { ids: invoiceIds }, transaction }
        );

        await sequelize.query(
            `DELETE FROM sales_invoice_bill_items WHERE invoice_bill_id IN (:ids)`,
            { replacements: { ids: invoiceIds }, transaction }
        );

        await sequelize.query(
            `DELETE FROM sales_invoice_adjustments WHERE sales_invoice_id IN (:ids)`,
            { replacements: { ids: invoiceIds }, transaction }
        );

        await sequelize.query(
            `DELETE FROM payments WHERE invoice_bill_id IN (:ids)`,
            { replacements: { ids: invoiceIds }, transaction }
        );

        await transaction.commit();
        console.log(`✅ Deleted ${invoiceIds.length} expired on-hold invoices`);
    } catch (error) {
        await transaction.rollback();
        console.error('❌ On-hold invoice cleanup failed:', error);
    }
};

module.exports = deleteExpiredOnHoldInvoices;
