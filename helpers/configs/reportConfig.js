const REPORT_CONFIG = {
    old_jewel: {
        table: "old_jewels",
        itemTable: "old_jewel_items",
        itemFk: "old_jewel_id",
        dateColumn: "t.created_at",
        codeColumn: "old_jewel_code",
        weightColumn: "net_weight",
        quantityExpr: "COUNT(i.id)",
        statusCondition: "AND t.status = 'Printed'"
    },

    jewel_repair: {
        table: "jewel_repairs",
        itemTable: "jewel_repair_items",
        itemFk: "repair_id",
        dateColumn: "t.created_at",
        codeColumn: "repair_code",
        weightColumn: "(i.weight * i.quantity)",
        quantityExpr: "COALESCE(SUM(i.quantity),0)",
        statusCondition: "AND t.status = 'Completed'"
    },

    estimate: {
        table: "estimate_bills",
        itemTable: "estimate_bill_items",
        itemFk: "estimate_bill_id",
        dateColumn: "t.created_at",
        codeColumn: "estimate_no",
        weightColumn: null,
        quantityExpr: "SUM(i.quantity)",
        statusCondition: "AND t.status = 'Printed'"
    },

    sales_invoice: {
        table: "sales_invoice_bills",
        itemTable: "sales_invoice_bill_items",
        itemFk: "invoice_bill_id",
        dateColumn: "t.created_at",
        codeColumn: "invoice_no",
        weightColumn: "(i.net_weight * i.quantity)",
        quantityExpr: "SUM(i.quantity)",
        statusCondition: "AND t.status = 'Invoice'"
    },

    sales_return: {
        table: "sales_returns",
        itemTable: "sales_return_items",
        itemFk: "sales_return_id",
        dateColumn: "t.created_at",
        codeColumn: "sales_return_no",
        weightColumn: "(CAST(i.net_weight AS NUMERIC) * i.quantity)",
        quantityExpr: "SUM(i.quantity)",
        statusCondition: "AND t.status = 'Printed'"
    }
};

module.exports = REPORT_CONFIG;
