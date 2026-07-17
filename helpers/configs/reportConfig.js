const REPORT_CONFIG = {
    old_jewel: {
        table: "old_jewels",
        itemTable: "old_jewel_items",
        itemFk: "old_jewel_id",
        dateColumn: "t.created_at",
        codeColumn: "old_jewel_code",
        weightColumn: "net_weight",
        quantityExpr: "COUNT(i.id)",
        statusCondition: "AND t.status = 'Printed'",
        extraSelectSql: ", inv.invoice_no",
        extraJoinSql: `
        LEFT JOIN (
            SELECT sa.reference_id AS old_jewel_id, MAX(sib.invoice_no) AS invoice_no
            FROM sales_invoice_adjustments sa
            JOIN sales_invoice_bills sib
                ON sib.id = sa.sales_invoice_id
                AND sib.deleted_at IS NULL
                AND sib.status = 'Invoice'
                AND sib.is_active = true
            WHERE sa.deleted_at IS NULL
              AND sa.adjustment_type_id = '2'
            GROUP BY sa.reference_id
        ) inv ON inv.old_jewel_id = t.id`
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
  weightColumn: "(i.net_weight * (i.quantity - i.returned_quantity))",
  quantityExpr: "SUM(i.quantity - i.returned_quantity)",
  statusCondition: "AND t.status = 'Invoice'",
  itemCondition: "AND COALESCE(i.is_returned, false) = false",

  extraSelectSql: `
    , COALESCE(adj.sales_return_amount, 0) AS sales_return_amount
    , COALESCE(adj.old_jewel_amount, 0) AS old_jewel_amount
    , COALESCE(
        adj.saving_scheme_collection_amount,
        0
      ) AS saving_scheme_collection_amount

    , adj.sales_return_no
    , adj.old_jewel_code
    , adj.enrollment_code
  `,

    extraJoinSql: `
        LEFT JOIN (
        SELECT
            a.sales_invoice_id,

            COALESCE(
            SUM(
                CASE
                WHEN a.adjustment_type_id::integer = 1
                THEN a.adjustment_amount
                ELSE 0
                END
            ),
            0
            ) AS sales_return_amount,

            COALESCE(
            SUM(
                CASE
                WHEN a.adjustment_type_id::integer = 2
                THEN a.adjustment_amount
                ELSE 0
                END
            ),
            0
            ) AS old_jewel_amount,

            COALESCE(
            SUM(
                CASE
                WHEN a.adjustment_type_id::integer = 3
                THEN a.adjustment_amount
                ELSE 0
                END
            ),
            0
            ) AS saving_scheme_collection_amount,

            STRING_AGG(
            DISTINCT CASE
                WHEN a.adjustment_type_id::integer = 1
                THEN sr.sales_return_no
            END,
            ', '
            ) AS sales_return_no,

            STRING_AGG(
            DISTINCT CASE
                WHEN a.adjustment_type_id::integer = 2
                THEN oj.old_jewel_code
            END,
            ', '
            ) AS old_jewel_code,

            STRING_AGG(
            DISTINCT CASE
                WHEN a.adjustment_type_id::integer = 3
                THEN ce.enrollment_code
            END,
            ', '
            ) AS enrollment_code

        FROM sales_invoice_adjustments a

        LEFT JOIN sales_returns sr
            ON sr.id = a.reference_id
            AND sr.deleted_at IS NULL
            AND a.adjustment_type_id::integer = 1

        LEFT JOIN old_jewels oj
            ON oj.id = a.reference_id
            AND oj.deleted_at IS NULL
            AND a.adjustment_type_id::integer = 2

        LEFT JOIN customer_enrollments ce
            ON ce.id = a.reference_id
            AND ce.deleted_at IS NULL
            AND a.adjustment_type_id::integer = 3

        WHERE a.deleted_at IS NULL
        GROUP BY a.sales_invoice_id
        ) adj ON adj.sales_invoice_id = t.id
    `,
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
