const REPORT_CONFIG = {
    old_jewel: {
        table: "old_jewels",
        itemTable: "old_jewel_items",
        itemFk: "old_jewel_id",
        dateColumn: "t.created_at",
        codeColumn: "old_jewel_code",
        weightColumn: "net_weight",
        quantityExpr: "COUNT(i.id)"
    },

    jewel_repair: {
        table: "jewel_repairs",
        itemTable: "jewel_repair_items",
        itemFk: "repair_id",
        dateColumn: "t.created_at",
        codeColumn: "repair_code",
        weightColumn: "weight",
        quantityExpr: "COUNT(i.id)"
    },

    estimate: {
        table: "estimate_bills",
        itemTable: "estimate_bill_items",
        itemFk: "estimate_bill_id",
        dateColumn: "t.created_at",
        codeColumn: "estimate_no",
        weightColumn: null,
        quantityExpr: "SUM(i.quantity)" 
    },

    sales_invoice: {
        table: "sales_invoice_bills",
        itemTable: "sales_invoice_bill_items",
        itemFk: "invoice_bill_id",
        dateColumn: "t.created_at",
        codeColumn: "invoice_no",
        weightColumn: "net_weight",
        quantityExpr: "SUM(i.quantity)" 
    },

    sales_return: {
        table: "sales_returns",
        itemTable: "sales_return_items",
        itemFk: "sales_return_id",
        dateColumn: "t.created_at",
        codeColumn: "sales_return_no",
        weightColumn: "CAST(i.net_weight AS NUMERIC)",
        quantityExpr: "SUM(i.quantity)"
    }
};

module.exports = REPORT_CONFIG;
