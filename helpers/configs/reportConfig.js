const REPORT_CONFIG = {
    old_jewel: {
        table: "old_jewels",
        itemTable: "old_jewel_items",
        itemFk: "old_jewel_id",
        dateColumn: "t.date",
        weightColumn: "net_weight",
        codeColumn: "old_jewel_code",
        quantityExpr: "COUNT(id)"
    },

    jewel_repair: {
        table: "jewel_repairs",
        itemTable: "jewel_repair_items",
        itemFk: "repair_id",
        dateColumn: "t.date",
        weightColumn: "weight",
        codeColumn: "repair_code",
        quantityExpr: "COUNT(id)"
    },

    estimate: {
        table: "estimate_bills",
        itemTable: "estimate_bill_items",
        itemFk: "estimate_bill_id",
        dateColumn: "t.estimate_date",
        weightColumn: null,
        codeColumn: "estimate_no",
        quantityExpr: "SUM(quantity)"
    },

    sales_invoice: {
        table: "sales_invoice_bills",
        itemTable: "sales_invoice_bill_items",
        itemFk: "invoice_bill_id",
        dateColumn: "t.invoice_date",
        weightColumn: "net_weight",
        codeColumn: "invoice_no",
        quantityExpr: "SUM(quantity)"
    },

    sales_return: {
        table: "sales_returns",
        itemTable: "sales_return_items",
        itemFk: "sales_return_id",
        dateColumn: "t.return_date",
        weightColumn: "net_weight",
        codeColumn: "sales_return_no",
        quantityExpr: "SUM(quantity)"
    }
};

module.exports = REPORT_CONFIG;
