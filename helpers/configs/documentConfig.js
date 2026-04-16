const { models } = require("../../models");

const documentConfig = {
    1: {
        name: "Estimate",
        model: models.EstimateBill,
        field: "estimate_no",
    },
    2: {
        name: "Sales Invoice",
        model: models.SalesInvoiceBill,
        field: "invoice_no",
    },
    3: {
        name: "Sales Return",
        model: models.SalesReturn,
        field: "sales_return_no",
    },
    4: {
        name: "Old Jewel",
        model: models.OldJewel,
        field: "old_jewel_code",
    },
    5: {
        name: "Jewel Repair",
        model: models.JewelRepair,
        field: "repair_code",
    },
    6: {
        name: "Payment",
        model: models.VendorPayment,
        field: "payment_no",
    },
    7: {
        name: "Receipt",
        model: models.VoucherReceipt,
        field: "receipt_no",
    },
    8: {
        name: "Journal Entry",
        model: models.JournalEntry,
        field: "journal_no",
    },
    9: {
        name: "Grn",
        model: models.Grn,
        field: "grn_no",
    }
};

module.exports = documentConfig;