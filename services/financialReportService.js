const { sequelize } = require("../models");
const commonService = require("./commonService");

// Resolve a chart leaf id by (ledger_name, ledger_group_name) — the by-NAME
// convention used throughout this report.
// PERF: this used to expand to its own inline
//   (SELECT l.id FROM ledger l JOIN ledger_group grp … ORDER BY l.id LIMIT 1)
// pasted into every branch — 79 such subqueries resolving only 28 distinct
// lookups, on every report call. All 28 are now resolved by ONE pass over the
// chart in the `led` CTE below and read back as a column. MIN(l.id) IS exactly
// `ORDER BY l.id LIMIT 1`, and both stay NULL when the leaf is not seeded, so
// every fallback/COALESCE semantic documented below is unchanged.
const LEAF = (name, group) =>
  `MIN(l.id) FILTER (WHERE l.ledger_name = '${name}' AND grp.ledger_group_name = '${group}')`;

// Leaf matched on ledger_name ALONE (no group predicate). The three collection
// leaves have always been resolved this way — kept as-is on purpose: adding the
// group predicate could change which ledger they resolve to on a live chart.
const NAMED_LEAF = (name) => `MIN(l.id) FILTER (WHERE l.ledger_name = '${name}')`;

// ANY active leaf in a group (lowest id) — the guaranteed-resolvable fallback.
const ANY_LEAF = (group) =>
  `MIN(l.id) FILTER (WHERE grp.ledger_group_name = '${group}')`;

// Every posting target the report can use, resolved in a single scan of the
// chart. It aggregates with NO GROUP BY, so it always yields exactly one row
// (all-NULL on an empty chart) and can never add or drop rows anywhere.
const LEDGER_LOOKUP_CTE = `
  led AS (
    SELECT
      ${NAMED_LEAF("Cash in Hand")}                            AS cash_id,
      ${NAMED_LEAF("UPI Collections")}                         AS upi_id,
      ${NAMED_LEAF("Card Collections")}                        AS card_id,
      ${LEAF("Bank Accounts", "Current Assets")}               AS bank_leaf_id,
      ${ANY_LEAF("Bank Accounts")}                             AS bank_group_id,
      ${LEAF("Output CGST", "Duties & Taxes")}                 AS out_cgst_id,
      ${LEAF("Output SGST", "Duties & Taxes")}                 AS out_sgst_id,
      ${LEAF("Output IGST", "Duties & Taxes")}                 AS out_igst_id,
      ${LEAF("GST Input CGST", "Current Assets")}              AS in_cgst_id,
      ${LEAF("GST Input SGST", "Current Assets")}              AS in_sgst_id,
      ${LEAF("GST Input IGST", "Current Assets")}              AS in_igst_id,
      ${LEAF("Sales", "Sales Accounts")}                       AS sales_id,
      ${LEAF("Silver Sales", "Sales Accounts")}                AS silver_sales_id,
      ${ANY_LEAF("Sales Accounts")}                            AS any_sales_id,
      ${LEAF("Sales Return", "Sales Accounts")}                AS sales_return_id,
      ${LEAF("Old Gold Sales", "Sales Accounts")}              AS old_gold_sales_id,
      ${LEAF("Purchase", "Purchase Accounts")}                 AS purchase_id,
      ${LEAF("Silver Purchase", "Purchase Accounts")}          AS silver_purchase_id,
      ${ANY_LEAF("Purchase Accounts")}                         AS any_purchase_id,
      ${LEAF("Purchase Return", "Purchase Accounts")}          AS purchase_return_id,
      ${LEAF("Old Gold Purchase", "Purchase Accounts")}        AS old_gold_pur_id,
      ${LEAF("Stone Purchase Cost", "Direct Expenses")}        AS stone_id,
      ${LEAF("Repair Charges Income", "Direct Income")}        AS repair_income_id,
      ${ANY_LEAF("Direct Income")}                             AS any_direct_income_id,
      ${LEAF("Scheme Collection Liability", "Current Liabilities")} AS scheme_liab_id,
      ${LEAF("Round Off", "Indirect Income")}                  AS roundoff_income_id,
      ${LEAF("Round Off", "Indirect Expenses")}                AS roundoff_expense_id,
      ${LEAF("Discount Received", "Indirect Income")}          AS discount_received_id
    FROM ledger l
    JOIN ledger_group grp ON grp.id = l.ledger_group_id
    WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
  )`;

// Read a resolved id back out of the single-row `led` CTE. Uncorrelated, so
// Postgres evaluates it once per statement as an InitPlan — the same treatment
// the old inline lookups got, minus 51 redundant index scans.
const LED = (expr) => `(SELECT ${expr} FROM led)`;

// The three payment-collection leaves + the bank leaf.
const CASH_LEDGER = LED(`led.cash_id`);
const UPI_LEDGER = LED(`led.upi_id`);
const CARD_LEDGER = LED(`led.card_id`);

// Output/Input GST leaves.
const OUT_CGST_LEDGER = LED(`led.out_cgst_id`);
const OUT_SGST_LEDGER = LED(`led.out_sgst_id`);
const OUT_IGST_LEDGER = LED(`led.out_igst_id`);
const IN_CGST_LEDGER = LED(`led.in_cgst_id`);
const IN_SGST_LEDGER = LED(`led.in_sgst_id`);
const IN_IGST_LEDGER = LED(`led.in_igst_id`);
const SCHEME_LIABILITY_LEDGER = LED(`led.scheme_liab_id`);

// Round-off targets. A rounding that leaves us WORSE off (sales collect less /
// purchase pay more) is an Indirect EXPENSE; BETTER off (collect more / pay
// less) is Indirect INCOME. COALESCE falls back to the pre-existing 'Discount
// Received' income leaf when the dedicated 'Round Off' ledgers are not seeded
// yet, so the report ALWAYS balances regardless of deploy order — run the
// add-round-off-ledgers seeder to move them onto the proper 'Round Off' leaves.
const ROUNDOFF_INCOME = LED(`COALESCE(led.roundoff_income_id, led.discount_received_id)`);
const ROUNDOFF_EXPENSE = LED(`COALESCE(led.roundoff_expense_id, led.roundoff_income_id, led.discount_received_id)`);

// Resilient posting ledgers for the single-purpose Sales/Purchase groups. The
// report USED to hard-code specific leaf names ('Silver Sales', 'Silver
// Purchase', 'Karigar Charges'); when the owner renamed/deleted those in the
// chart the by-name lookup returned NULL and the leg was silently DROPPED,
// unbalancing the entire report. These COALESCE chains try the current name,
// then the legacy name, then ANY active leaf in the group — so a posting can
// never vanish. (Safe here only because Sales/Purchase Accounts are
// single-purpose groups; do NOT group-fallback a mixed group like Current
// Assets, where a stray posting could land on the wrong leaf.)
const SALES_LEDGER = LED(`COALESCE(led.sales_id, led.silver_sales_id, led.any_sales_id)`);
const PURCHASE_LEDGER = LED(`COALESCE(led.purchase_id, led.silver_purchase_id, led.any_purchase_id)`);
const SALES_RETURN_LEDGER = LED(`COALESCE(led.sales_return_id, led.any_sales_id)`);
const OLD_GOLD_LEDGER = LED(`COALESCE(led.old_gold_pur_id, led.any_purchase_id)`);
// GRN stone cost: its own Direct-Expenses leaf, else fold into Purchase so it is
// never dropped. (Making/Karigar charges are folded into PURCHASE_LEDGER because
// the owner deleted the 'Karigar Charges' ledger — see B.Dr1.)
// The flattened COALESCE below is the old COALESCE(stone, PURCHASE_LEDGER).
const STONE_LEDGER = LED(`COALESCE(led.stone_id, led.purchase_id, led.silver_purchase_id, led.any_purchase_id)`);

// 'Bank Accounts' may be a single ledger under Current Assets OR — once the owner
// nests banks — a GROUP holding HDFC/IOB leaves. Resolve the ledger, else the
// first bank leaf under a 'Bank Accounts' group, so the AUTO-posted bank legs
// (e.g. a sales invoice paid by Bank Transfer) never drop when the chart is
// restructured. Manual receipts/vendor payments already post to the exact bank
// ledger the user picks, so they are unaffected.
const BANK_LEDGER = LED(`COALESCE(led.bank_leaf_id, led.bank_group_id)`);

// Resilient posting ledgers for the standalone old-gold / return flows (flow F).
const OLD_GOLD_SALES_LEDGER = LED(`COALESCE(led.old_gold_sales_id, led.any_sales_id)`);
const PURCHASE_RETURN_LEDGER = LED(`COALESCE(led.purchase_return_id, led.any_purchase_id)`);

// Jewel-repair income (flow G) -> 'Repair Charges Income' under Direct Income.
// If the Direct Income leaves are not seeded yet, fall back to any Direct Income
// leaf, then to the Sales ledger, so the leg never drops (run the
// add-direct-income-ledgers seeder to land it on the proper leaf).
// (The tail of the chain is SALES_LEDGER, flattened.)
const REPAIR_INCOME_LEDGER = LED(
  `COALESCE(led.repair_income_id, led.any_direct_income_id,
            led.sales_id, led.silver_sales_id, led.any_sales_id)`
);

// Payment mode -> collection ledger. Each flow normalises its own mode column to
// a MODE KEY in its scope CTE ('Bank Transfer' and 'Cheque' both mean the bank
// leaf, exactly as the old per-branch CASE did), so the posting target is
// resolved once per KEY instead of once per payment row.
const MODE_LEDGER = (col) => `
      CASE ${col}
        WHEN 'Cash' THEN ${CASH_LEDGER}
        WHEN 'UPI'  THEN ${UPI_LEDGER}
        WHEN 'Card' THEN ${CARD_LEDGER}
        WHEN 'Bank' THEN ${BANK_LEDGER}
      END`;

// Mode key for the tables that store the mode NAME (payments.payment_mode,
// payment_modes.payment_mode). Every THEN is an untyped literal so the result is
// text even when the source column is an ENUM. No ELSE — same as the old CASEs,
// and every call site restricts the column to exactly these five values.
const MODE_KEY = (col) => `
      CASE
        WHEN ${col} = 'Cash' THEN 'Cash'
        WHEN ${col} = 'UPI'  THEN 'UPI'
        WHEN ${col} = 'Card' THEN 'Card'
        WHEN ${col} IN ('Bank Transfer','Cheque') THEN 'Bank'
      END`;

// SOFT-DELETED PARTIES ARE DELIBERATELY INCLUDED.
// None of the customer/vendor joins below filter on the party's deleted_at.
// A posted voucher is a historical fact; soft-deleting a customer or vendor only
// removes them from the master LIST, it must never retract accounting history.
// Gating on deleted_at used to do real damage in two ways:
//   1. Self-balancing flows (F.1/F.2/F.3) lost every leg together — the books
//      still balanced but silently UNDERSTATED (old gold lost Rs.49,905.60).
//   2. Worse, on sales invoices / GRNs / jewel repairs the Cr leg is keyed off
//      the document alone while only the Dr leg carries the party join, so
//      deleting one customer knocked the TRIAL BALANCE out by their unpaid
//      amount (Rs.990.19 from a single deleted customer).
// The ledger half of each join stays: a leg posted to a deleted ledger is
// dropped by LEDGER_AGG_SELECT anyway, so gating there costs nothing.

// Flow-F sources. Old gold & sales returns are scoped to is_bill_adjusted = false
// (the bill-adjusted ones are already booked via A.Dr5/A.Dr7), and each carries a
// customer/vendor JOIN so its Dr and Cr legs share the SAME rows (stay balanced).
const OJ_STANDALONE = `
  FROM old_jewels oj
  JOIN customers c ON c.id = oj.customer_id
  JOIN ledger   lc ON lc.id = c.ledger_id  AND lc.deleted_at IS NULL
  WHERE oj.deleted_at IS NULL AND oj.is_active = true
    AND oj.is_bill_adjusted = false AND oj.status = 'Printed'
    AND (:branch_id IS NULL OR oj.branch_id = :branch_id)
    AND oj.date BETWEEN :from_date AND :to_date`;
const SR_STANDALONE = `
  FROM sales_returns r
  JOIN customers c ON c.id = r.customer_id
  JOIN ledger   lc ON lc.id = c.ledger_id  AND lc.deleted_at IS NULL
  WHERE r.deleted_at IS NULL AND r.is_active = true
    AND r.is_bill_adjusted = false
    AND r.status NOT IN ('Draft','Cancelled','On Hold')
    AND (:branch_id IS NULL OR r.branch_id = :branch_id)
    AND r.return_date BETWEEN :from_date AND :to_date`;
const PR_BASE = `
  FROM purchase_returns pr
  JOIN vendors v ON v.id = pr.vendor_id
  JOIN ledger  lv ON lv.id = v.ledger_id AND lv.deleted_at IS NULL
  WHERE pr.deleted_at IS NULL
    AND (:branch_id IS NULL OR pr.branch_id = :branch_id)
    AND pr.pr_date BETWEEN :from_date AND :to_date`;

// Shared CTE: aggregates all transaction sources by ledger_id for a date range.
// `led` MUST come first in the WITH list — every ${..._LEDGER} below expands to
// `(SELECT … FROM led)`, and a WITH item is only visible to items after it.
const ALL_TXNS_CTE = `
  WITH ${LEDGER_LOOKUP_CTE},
  -- MATERIALIZED IS LOAD-BEARING, DO NOT REMOVE.
  -- all_txns is referenced exactly once (the LEFT JOIN in LEDGER_AGG_SELECT), so
  -- PG12+ would auto-INLINE it and is then free to put this 45-branch UNION on
  -- the inner side of a nested loop over ledger l -- re-running the whole union
  -- once per ledger row (~1.4k rows). Measured: >120 s inlined vs 2.6 s here.
  all_txns AS MATERIALIZED (

    /* =========================================================
       A) SALES INVOICE  (status = 'Invoice')
       Cr: Silver Sales (subtotal) + Output CGST/SGST/IGST
       Dr: payment-mode ledgers + adjustment ledgers + customer receivable
       Balance: subtotal+cgst+sgst+igst = Σpay(5 modes) + Σadj(1,2,3) + receivable
       ALL legs keyed off the INVOICE (s.invoice_date + s.branch_id) so an
       invoice's Dr and Cr always enter/leave the report window together.
       ========================================================= */

    -- A.Cr1  Sales (was 'Silver Sales') = subtotal_amount
    SELECT
      ${SALES_LEDGER}                                           AS ledger_id,
      0 AS debit,
      COALESCE(s.subtotal_amount, 0) AS credit,
      s.invoice_date::date AS txn_date,
      s.invoice_no::text   AS reference_no
    FROM sales_invoice_bills s
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Cr2  Output CGST
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Output CGST' AND g.ledger_group_name = 'Duties & Taxes'
        ORDER BY l.id LIMIT 1),
      0, COALESCE(s.cgst_amount, 0), s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_bills s
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Cr3  Output SGST
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Output SGST' AND g.ledger_group_name = 'Duties & Taxes'
        ORDER BY l.id LIMIT 1),
      0, COALESCE(s.sgst_amount, 0), s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_bills s
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Cr4  Output IGST
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Output IGST' AND g.ledger_group_name = 'Duties & Taxes'
        ORDER BY l.id LIMIT 1),
      0, COALESCE(s.igst_amount, 0), s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_bills s
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr1  Cash in Hand = Σ payments(mode=Cash) on this invoice
    --  (joined to the invoice; filtered by INVOICE date/branch, not payment date)
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Cash in Hand'
        ORDER BY l.id LIMIT 1),
      COALESCE(p.amount_received, 0), 0, s.invoice_date::date, s.invoice_no::text
    FROM payments p
    JOIN sales_invoice_bills s ON s.id = p.invoice_bill_id
    WHERE p.deleted_at IS NULL AND s.deleted_at IS NULL
      AND p.status = 'Completed' AND s.status = 'Invoice'
      AND p.payment_mode = 'Cash'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr2  UPI Collections
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'UPI Collections'
        ORDER BY l.id LIMIT 1),
      COALESCE(p.amount_received, 0), 0, s.invoice_date::date, s.invoice_no::text
    FROM payments p
    JOIN sales_invoice_bills s ON s.id = p.invoice_bill_id
    WHERE p.deleted_at IS NULL AND s.deleted_at IS NULL
      AND p.status = 'Completed' AND s.status = 'Invoice'
      AND p.payment_mode = 'UPI'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr3  Card Collections
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Card Collections'
        ORDER BY l.id LIMIT 1),
      COALESCE(p.amount_received, 0), 0, s.invoice_date::date, s.invoice_no::text
    FROM payments p
    JOIN sales_invoice_bills s ON s.id = p.invoice_bill_id
    WHERE p.deleted_at IS NULL AND s.deleted_at IS NULL
      AND p.status = 'Completed' AND s.status = 'Invoice'
      AND p.payment_mode = 'Card'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr4  Bank Accounts (Bank Transfer / Cheque)
    SELECT
      ${BANK_LEDGER},
      COALESCE(p.amount_received, 0), 0, s.invoice_date::date, s.invoice_no::text
    FROM payments p
    JOIN sales_invoice_bills s ON s.id = p.invoice_bill_id
    WHERE p.deleted_at IS NULL AND s.deleted_at IS NULL
      AND p.status = 'Completed' AND s.status = 'Invoice'
      AND p.payment_mode IN ('Bank Transfer', 'Cheque')
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr5  Old Gold Purchase (adjustment_type_id '2' Old Jewel) — under
    --  'Purchase Accounts' (the Sales-side leaf is 'Old Gold Sales').
    SELECT
      ${OLD_GOLD_LEDGER},
      COALESCE(a.adjustment_amount, 0), 0, s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_adjustments a
    JOIN sales_invoice_bills s ON s.id = a.sales_invoice_id
    WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.status = 'Invoice' AND a.adjustment_type_id = '2'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr6  Scheme Collection Liability (adjustment_type_id '3' Saving Scheme)
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Scheme Collection Liability' AND g.ledger_group_name = 'Current Liabilities'
        ORDER BY l.id LIMIT 1),
      COALESCE(a.adjustment_amount, 0), 0, s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_adjustments a
    JOIN sales_invoice_bills s ON s.id = a.sales_invoice_id
    WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.status = 'Invoice' AND a.adjustment_type_id = '3'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr7  Sales Return (adjustment_type_id '1')
    SELECT
      ${SALES_RETURN_LEDGER},
      COALESCE(a.adjustment_amount, 0), 0, s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_adjustments a
    JOIN sales_invoice_bills s ON s.id = a.sales_invoice_id
    WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.status = 'Invoice' AND a.adjustment_type_id = '1'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr8a  Customer receivable (Sundry Debtors leaf) = UNPAID remainder
    --  = total_amount (rounded net payable, already net of type 1/2/3 adjustments)
    --    minus the cash-like payments collected.
    --  Round-off is NO LONGER absorbed here (moved to A.Dr8b/8c below), so a
    --  fully-paid invoice leaves exactly ZERO in Sundry Debtors instead of a few
    --  stray paise. pay.paid is restricted to the same 5 cash-like modes booked in
    --  A.Dr1..4 (Advance/Other settle elsewhere). Computed live from payments so
    --  it stays correct if a payment is added after invoice creation.
    --  Posted GROSS then SETTLED (two legs) rather than as one netted debit.
    --  The net per customer is identical — total_amount, less the same 5
    --  cash-like modes — so every balance here is unchanged, but the ledger
    --  STATEMENT (/report/ledger-account, same postings) can now show the
    --  invoice and the collection as separate lines. Netted into one row, a
    --  fully-paid customer produced a single ZERO row and their statement came
    --  back empty.
    SELECT
      lc.id,
      COALESCE(s.total_amount,0) AS debit,
      0, s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_bills s
    JOIN customers c ON c.id = s.customer_id
    JOIN ledger lc ON lc.id = c.ledger_id AND lc.deleted_at IS NULL
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Cr5  Customer settlement — the counterpart of A.Dr1..4, one row per
    --  payment, restricted to exactly the modes A.Dr1..4 book. Keyed off the
    --  INVOICE date/branch like every other leg of flow A, so an invoice's Dr
    --  and Cr always enter the report window together.
    SELECT
      lc.id,
      0, COALESCE(p.amount_received, 0), s.invoice_date::date, s.invoice_no::text
    FROM payments p
    JOIN sales_invoice_bills s ON s.id = p.invoice_bill_id
    JOIN customers c ON c.id = s.customer_id
    JOIN ledger lc ON lc.id = c.ledger_id AND lc.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND s.deleted_at IS NULL
      AND p.status = 'Completed' AND s.status = 'Invoice'
      AND p.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr8b  Sales round-off LOSS (bill rounded DOWN -> collected LESS -> worse off)
    --  Booked to Round Off under Indirect EXPENSES.
    --  loss = (subtotal+cgst+sgst+igst - adjustments) - total_amount, when > 0.
    --  The customer JOIN gates this leg to exactly the same rows as A.Dr8a.
    SELECT
      ${ROUNDOFF_EXPENSE},
      GREATEST(
        ( COALESCE(s.subtotal_amount,0) + COALESCE(s.cgst_amount,0)
          + COALESCE(s.sgst_amount,0) + COALESCE(s.igst_amount,0)
          - COALESCE(adj.adjusted,0) ) - COALESCE(s.total_amount,0), 0) AS debit,
      0, s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_bills s
    JOIN customers c ON c.id = s.customer_id
    JOIN ledger lc ON lc.id = c.ledger_id AND lc.deleted_at IS NULL
    LEFT JOIN (
      SELECT a.sales_invoice_id, SUM(COALESCE(a.adjustment_amount,0)) AS adjusted
      FROM sales_invoice_adjustments a
      WHERE a.deleted_at IS NULL AND a.adjustment_type_id IN ('1','2','3')
      GROUP BY a.sales_invoice_id
    ) adj ON adj.sales_invoice_id = s.id
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr8c  Sales round-off GAIN (bill rounded UP -> collected MORE -> better off)
    --  Booked to Round Off under Indirect INCOME (credit).
    --  gain = total_amount - (subtotal+cgst+sgst+igst - adjustments), when > 0.
    SELECT
      ${ROUNDOFF_INCOME},
      0,
      GREATEST( COALESCE(s.total_amount,0) -
        ( COALESCE(s.subtotal_amount,0) + COALESCE(s.cgst_amount,0)
          + COALESCE(s.sgst_amount,0) + COALESCE(s.igst_amount,0)
          - COALESCE(adj.adjusted,0) ), 0) AS credit,
      s.invoice_date::date, s.invoice_no::text
    FROM sales_invoice_bills s
    JOIN customers c ON c.id = s.customer_id
    JOIN ledger lc ON lc.id = c.ledger_id AND lc.deleted_at IS NULL
    LEFT JOIN (
      SELECT a.sales_invoice_id, SUM(COALESCE(a.adjustment_amount,0)) AS adjusted
      FROM sales_invoice_adjustments a
      WHERE a.deleted_at IS NULL AND a.adjustment_type_id IN ('1','2','3')
      GROUP BY a.sales_invoice_id
    ) adj ON adj.sales_invoice_id = s.id
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       B) GRN  (purchase)
       Cr: Vendor (Sundry Creditors) = grns.total_amount
       Dr: Purchase (metal + making) + Stone(+others) + GST Input CGST/SGST/IGST
           + plug
       total_amount = subtotal + subtotal*(cgst_percent + sgst_percent
                      + igst_percent)/100
                      + discount_percent(signed round-off, ADDED)
       subtotal     = SUM(grnItems.total_amount) = SUM(net*rate + stone_wt*stone_rate
                      + making + others_value)
       Intra-state GRNs carry cgst_percent = sgst_percent with igst_percent 0/NULL;
       inter-state GRNs carry igst_percent only. All three legs post unconditionally
       (COALESCE to 0), so a GRN keyed with an odd mix is still reported at face
       value rather than silently dropped.
       Plug (B.Dr7) absorbs the signed round-off AND any 4dp->2dp rounding drift so
       Dr = Cr(total_amount) to the cent for every GRN.
       ========================================================= */

    -- B.Cr  Vendor (Sundry Creditors) = total_amount
    SELECT lv.id, 0, COALESCE(g.total_amount, 0), g.grn_date::date, g.grn_no::text
    FROM grns g
    JOIN vendors v ON v.id = g.vendor_id
    JOIN ledger lv ON lv.id = v.ledger_id AND lv.deleted_at IS NULL
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr1  Purchase (was 'Silver Purchase') = metal cost + making/Karigar charge.
    -- Taken as the RESIDUAL of the GRN subtotal after the stone/other component
    -- (NOT net_wt*rate, which some GRNs leave 0). The making charge is folded IN
    -- HERE — the owner DELETED the 'Karigar Charges' ledger, so it is shown along
    -- with the purchase value rather than as a separate Direct Expense.
    -- B.Dr1 + B.Dr2(stone) always sum to subtotal_amount, so the GRN stays balanced.
    SELECT
      ${PURCHASE_LEDGER},
      COALESCE(g.subtotal_amount, 0) - COALESCE(gi.stone, 0), 0,
      g.grn_date::date, g.grn_no::text
    FROM grns g
    LEFT JOIN (
      SELECT grn_id,
             SUM(COALESCE(stone_wt_in_g,0) * COALESCE(stone_rate,0)
                 + COALESCE(others_value,0)) AS stone
      FROM "grnItems" WHERE deleted_at IS NULL GROUP BY grn_id
    ) gi ON gi.grn_id = g.id
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr2  Stone Purchase Cost = SUM(stone_wt_in_g*stone_rate) + SUM(others_value)
    --  Falls back to the Purchase ledger if 'Stone Purchase Cost' is missing, so
    --  the stone cost is never dropped (STONE_LEDGER).
    SELECT
      ${STONE_LEDGER},
      COALESCE(gi.stone, 0), 0, g.grn_date::date, g.grn_no::text
    FROM grns g
    JOIN (
      SELECT grn_id,
             SUM(COALESCE(stone_wt_in_g,0) * COALESCE(stone_rate,0)
                 + COALESCE(others_value,0)) AS stone
      FROM "grnItems" WHERE deleted_at IS NULL GROUP BY grn_id
    ) gi ON gi.grn_id = g.id
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr4  GST Input CGST = subtotal_amount * cgst_percent / 100
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'GST Input CGST' AND grp.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.cgst_percent,0) / 100.0, 2), 0,
      g.grn_date::date, g.grn_no::text
    FROM grns g
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr5  GST Input SGST = subtotal_amount * sgst_percent / 100
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'GST Input SGST' AND grp.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.sgst_percent,0) / 100.0, 2), 0,
      g.grn_date::date, g.grn_no::text
    FROM grns g
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr6  GST Input IGST = subtotal_amount * igst_percent / 100
    --  Inter-state purchases. Mirrors the Purchase Return IGST reversal (F.3):
    --  without this leg the ledger only ever received credits and showed an
    --  abnormal credit balance on a Current Asset.
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'GST Input IGST' AND grp.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.igst_percent,0) / 100.0, 2), 0,
      g.grn_date::date, g.grn_no::text
    FROM grns g
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr7a  GRN round-off LOSS (payable rounded UP -> we pay MORE -> worse off)
    --  Booked to Round Off under Indirect EXPENSES.
    --  plug = total_amount - subtotal - CGST - SGST - IGST, when > 0. B.Dr1..2 already
    --  sum to subtotal, so this is a TRUE round-off (a few paise), not the metal cost.
    SELECT
      ${ROUNDOFF_EXPENSE},
      GREATEST(
          COALESCE(g.total_amount,0) - COALESCE(g.subtotal_amount, 0)
        - ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.cgst_percent,0) / 100.0, 2)
        - ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.sgst_percent,0) / 100.0, 2)
        - ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.igst_percent,0) / 100.0, 2), 0) AS debit,
      0, g.grn_date::date, g.grn_no::text
    FROM grns g
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr7b  GRN round-off GAIN (payable rounded DOWN -> we pay LESS -> better off)
    --  Booked to Round Off under Indirect INCOME (credit) = -(plug), when plug < 0.
    SELECT
      ${ROUNDOFF_INCOME},
      0,
      GREATEST(
          COALESCE(g.subtotal_amount, 0)
        + ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.cgst_percent,0) / 100.0, 2)
        + ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.sgst_percent,0) / 100.0, 2)
        + ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.igst_percent,0) / 100.0, 2)
        - COALESCE(g.total_amount,0), 0) AS credit,
      g.grn_date::date, g.grn_no::text
    FROM grns g
    WHERE g.deleted_at IS NULL AND g.is_active = true
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       C) SCHEME COLLECTION  (installment or voucher into a scheme)
       Sourced from payments JOIN customer_scheme_payments (captures both
       direct installments and bill_type_id=5 scheme vouchers uniformly).
       Dr payment-mode ledger ; Cr Scheme Collection Liability (same rows).
       FIX: branch filter via csp.branch_id, applied identically to both legs.
       ========================================================= */

    -- C.Dr  Payment-mode ledger for scheme collections
    SELECT
      CASE
        WHEN p.payment_mode = 'Cash' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Cash in Hand'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode = 'UPI' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode = 'Card' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode IN ('Bank Transfer','Cheque') THEN
          ${BANK_LEDGER}
      END AS ledger_id,
      COALESCE(p.amount_received, 0), 0,
      p.payment_date::date, csp.scheme_payment_code::text
    FROM payments p
    JOIN customer_scheme_payments csp ON csp.id = p.scheme_payment_id AND csp.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.status = 'Completed'
      AND p.scheme_payment_id IS NOT NULL
      AND p.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR csp.branch_id = :branch_id)
      AND p.payment_date::date BETWEEN :from_date AND :to_date

    UNION ALL

    -- C.Cr  Scheme Collection Liability (identical row set, opposite side)
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Scheme Collection Liability' AND g.ledger_group_name = 'Current Liabilities'
        ORDER BY l.id LIMIT 1),
      0, COALESCE(p.amount_received, 0),
      p.payment_date::date, csp.scheme_payment_code::text
    FROM payments p
    JOIN customer_scheme_payments csp ON csp.id = p.scheme_payment_id AND csp.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.status = 'Completed'
      AND p.scheme_payment_id IS NOT NULL
      AND p.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR csp.branch_id = :branch_id)
      AND p.payment_date::date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       D) VENDOR PAYMENT — BILL-BY-BILL / OTHERS  (money out to a vendor)
       Dr vendor (Sundry Creditors) = vp.amount ; Cr payment-mode ledger.
       Scope: bill_type_id NOT IN (2,3) — for those bill types account_name_id is
       a VENDOR id (user_type 1). On-Account/Advance (bill_type 2/3) point
       account_name_id at a LEDGER instead and are booked by flow D2 below (this
       mirrors vendorPaymentService's join logic exactly, and stops a stray
       On-Account row from being counted here AND in D2).
       FIX 1: D.Dr restricted to the SAME set of mapped modes (1..5) as D.Cr, so a
              mode 6 ('Other') payment cannot produce a Dr with no matching Cr.
       FIX 2: branch filter via vp.branch_id on both legs.
       ========================================================= */

    -- D.Dr  Vendor (Sundry Creditors)
    SELECT lv.id, COALESCE(vp.amount, 0), 0, vp.payment_date::date, vp.payment_no::text
    FROM vendor_payments vp
    JOIN vendors v ON v.id = vp.account_name_id
    JOIN ledger lv ON lv.id = v.ledger_id AND lv.deleted_at IS NULL
    JOIN payment_modes pm ON pm.id = vp.payment_mode
    WHERE vp.deleted_at IS NULL AND vp.status = 'Completed'
      AND vp.user_type_id = 1
      AND vp.bill_type_id NOT IN (2, 3)
      AND pm.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR vp.branch_id = :branch_id)
      AND vp.payment_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- D.Cr  Payment-mode ledger (payment_modes.id -> name -> exact leaf)
    SELECT
      CASE
        WHEN pm.payment_mode = 'Cash' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Cash in Hand'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode = 'UPI' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode = 'Card' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode IN ('Bank Transfer','Cheque') THEN
          ${BANK_LEDGER}
      END AS ledger_id,
      0, COALESCE(vp.amount, 0), vp.payment_date::date, vp.payment_no::text
    FROM vendor_payments vp
    JOIN payment_modes pm ON pm.id = vp.payment_mode
    WHERE vp.deleted_at IS NULL AND vp.status = 'Completed'
      AND vp.user_type_id = 1
      AND vp.bill_type_id NOT IN (2, 3)
      AND pm.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR vp.branch_id = :branch_id)
      AND vp.payment_date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       D2) VENDOR PAYMENT — ON ACCOUNT / ADVANCE  (bill_type_id IN (2,3))
       For these bill types account_name_id is a LEDGER id chosen directly on the
       form (Furniture, a bank, an expense ledger, …) — NOT a vendor id — exactly
       as vendorPaymentService resolves it. user_type_id is NULL here, so flow D
       never books them; without this leg the payment vanished from the reports.
       Post:
         Dr <chosen ledger>       = vp.amount
         Cr <payment-mode ledger> = vp.amount
       e.g. buy Furniture by UPI -> Dr Furniture / Cr UPI Collections;
            deposit cash to bank  -> Dr Bank / Cr Cash in Hand.
       Both legs share the SAME ledger JOIN on account_name_id, so if that ledger
       is missing both drop together and the flow stays balanced.
       ========================================================= */

    -- D2.Dr  the ledger picked on the form (account_name_id)
    SELECT ld.id, COALESCE(vp.amount, 0), 0, vp.payment_date::date, vp.payment_no::text
    FROM vendor_payments vp
    JOIN ledger ld ON ld.id = vp.account_name_id AND ld.deleted_at IS NULL
    JOIN payment_modes pm ON pm.id = vp.payment_mode
    WHERE vp.deleted_at IS NULL AND vp.status = 'Completed'
      AND vp.bill_type_id IN (2, 3)
      AND pm.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR vp.branch_id = :branch_id)
      AND vp.payment_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- D2.Cr  payment-mode ledger (identical row set via the same ledger JOIN)
    SELECT
      CASE
        WHEN pm.payment_mode = 'Cash' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Cash in Hand'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode = 'UPI' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode = 'Card' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode IN ('Bank Transfer','Cheque') THEN
          ${BANK_LEDGER}
      END AS ledger_id,
      0, COALESCE(vp.amount, 0), vp.payment_date::date, vp.payment_no::text
    FROM vendor_payments vp
    JOIN ledger ld ON ld.id = vp.account_name_id AND ld.deleted_at IS NULL
    JOIN payment_modes pm ON pm.id = vp.payment_mode
    WHERE vp.deleted_at IS NULL AND vp.status = 'Completed'
      AND vp.bill_type_id IN (2, 3)
      AND pm.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR vp.branch_id = :branch_id)
      AND vp.payment_date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       Voucher Receipts (kept from old branches 14/15), EXCLUDING scheme
       vouchers (booked by flow C). FIXES:
       - restrict to ledger-carrying bill_type_id IN (2,3) so account_id is
         always a ledger id (bill_type 5 stores a customer_id; excluding it here
         both avoids the scheme double-count AND the account_id->ledger mis-join).
       - V.Dr resolved from payment_mode_id (was hard-coded Cash), so UPI/Card/
         Bank receipts are not misclassified as cash.
       ========================================================= */

    -- V.Dr  payment-mode ledger for manual receipt vouchers (non-scheme)
    SELECT
      CASE
        WHEN r.payment_mode_id = 1 THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Cash in Hand'
            ORDER BY l.id LIMIT 1)
        WHEN r.payment_mode_id = 5 THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections'
            ORDER BY l.id LIMIT 1)
        WHEN r.payment_mode_id = 2 THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections'
            ORDER BY l.id LIMIT 1)
        WHEN r.payment_mode_id IN (3,4) THEN
          ${BANK_LEDGER}
      END AS ledger_id,
      COALESCE(r.amount, 0), 0, r.receipt_date::date, r.receipt_no::text
    FROM voucher_receipts r
    WHERE r.deleted_at IS NULL AND r.is_active = true
      AND r.bill_type_id IN (2, 3)
      AND r.payment_mode_id IN (1,2,3,4,5)
      AND (:branch_id IS NULL OR r.branch_id = :branch_id)
      AND r.receipt_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- V.Cr  account_id ledger for manual receipt vouchers (non-scheme)
    --  account_id is a ledger id for bill_type 2/3 (verified in voucherReceiptService).
    SELECT lc.id, 0, COALESCE(r.amount, 0), r.receipt_date::date, r.receipt_no::text
    FROM voucher_receipts r
    JOIN ledger lc ON lc.id = r.account_id AND lc.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND r.is_active = true
      AND r.bill_type_id IN (2, 3)
      AND r.payment_mode_id IN (1,2,3,4,5)
      AND (:branch_id IS NULL OR r.branch_id = :branch_id)
      AND r.receipt_date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       E) JOURNAL ENTRIES — kept as-is
       ========================================================= */
    SELECT jei.account_id, COALESCE(jei.debit, 0), COALESCE(jei.credit, 0),
           je.date::date, je.journal_no::text
    FROM journal_entry_items jei
    JOIN journal_entries je ON je.id = jei.journal_entry_id
    WHERE jei.deleted_at IS NULL AND je.deleted_at IS NULL
      AND (:branch_id IS NULL OR je.branch_id = :branch_id)
      AND je.date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       F) STANDALONE OLD GOLD / SALES RETURN / PURCHASE RETURN
       Recorded in their OWN tables (not bill-adjusted, no cash leg), so the
       settlement is the PARTY ledger:
         - old gold / sales return -> the shop OWES the customer (a credit under
           Sundry Debtors, so those customers carry a credit balance).
         - purchase return          -> the vendor OWES the shop (reduce Sundry Creditors).
       Scoped to is_bill_adjusted = false so the bill-adjusted ones (already in
       A.Dr5/A.Dr7 via sales_invoice_adjustments) are NOT double-counted. Each
       flow is self-balancing (Σ debit = Σ credit).
       ========================================================= */

    -- F.1  Old Gold: Dr 'Old Gold Sales' (Sales Accounts) ; Cr customer ledger
    SELECT ${OLD_GOLD_SALES_LEDGER}, COALESCE(oj.total_amount, 0), 0,
           oj.date::date, oj.old_jewel_code::text ${OJ_STANDALONE}
    UNION ALL
    SELECT lc.id, 0, COALESCE(oj.total_amount, 0),
           oj.date::date, oj.old_jewel_code::text ${OJ_STANDALONE}

    UNION ALL

    -- F.2  Sales Return (standalone refund) — reverse the sale.
    --  Dr 'Sales Return' (net residual) + Dr Output CGST/SGST/IGST ; Cr customer (total).
    SELECT ${SALES_RETURN_LEDGER},
      ( COALESCE(r.subtotal_amount, 0) ), 0,
      r.return_date::date, r.sales_return_no::text ${SR_STANDALONE}
    UNION ALL
    SELECT ${OUT_CGST_LEDGER}, COALESCE(r.cgst_amount,0), 0,
      r.return_date::date, r.sales_return_no::text ${SR_STANDALONE}
    UNION ALL
    SELECT ${OUT_SGST_LEDGER}, COALESCE(r.sgst_amount,0), 0,
      r.return_date::date, r.sales_return_no::text ${SR_STANDALONE}
    UNION ALL
    SELECT ${OUT_IGST_LEDGER}, COALESCE(r.igst_amount,0), 0,
      r.return_date::date, r.sales_return_no::text ${SR_STANDALONE}
    UNION ALL
    SELECT lc.id, 0, COALESCE(r.total_amount,0),
      r.return_date::date, r.sales_return_no::text ${SR_STANDALONE}

    UNION ALL

    -- F.3  Purchase Return — reverse the purchase.
    --  Dr vendor (reduce Sundry Creditors) ; Cr 'Purchase Return' (net) +
    --  Cr GST Input CGST/SGST/IGST (reverse input tax). Vendor Dr = the full
    --  reversed value so the leg self-balances (discount_percent not applied).
    SELECT ${PURCHASE_RETURN_LEDGER}, 0, COALESCE(pr.subtotal_amount,0),
      pr.pr_date::date, pr.pr_no::text ${PR_BASE}
    UNION ALL
    SELECT ${IN_CGST_LEDGER}, 0,
      ROUND(COALESCE(pr.subtotal_amount,0) * COALESCE(pr.cgst_percent,0) / 100.0, 2),
      pr.pr_date::date, pr.pr_no::text ${PR_BASE}
    UNION ALL
    SELECT ${IN_SGST_LEDGER}, 0,
      ROUND(COALESCE(pr.subtotal_amount,0) * COALESCE(pr.sgst_percent,0) / 100.0, 2),
      pr.pr_date::date, pr.pr_no::text ${PR_BASE}
    UNION ALL
    SELECT ${IN_IGST_LEDGER}, 0,
      ROUND(COALESCE(pr.subtotal_amount,0) * COALESCE(pr.igst_percent,0) / 100.0, 2),
      pr.pr_date::date, pr.pr_no::text ${PR_BASE}
    UNION ALL
    SELECT lv.id,
      ( COALESCE(pr.subtotal_amount,0)
        + ROUND(COALESCE(pr.subtotal_amount,0) * COALESCE(pr.cgst_percent,0) / 100.0, 2)
        + ROUND(COALESCE(pr.subtotal_amount,0) * COALESCE(pr.sgst_percent,0) / 100.0, 2)
        + ROUND(COALESCE(pr.subtotal_amount,0) * COALESCE(pr.igst_percent,0) / 100.0, 2) ), 0,
      pr.pr_date::date, pr.pr_no::text ${PR_BASE}

    UNION ALL

    /* =========================================================
       G) JEWEL REPAIR  (service income — NO GST on jewel_repairs)
       Cr 'Repair Charges Income' (Direct Income) = total_amount
       Dr payment-mode ledgers (from payments.jewel_repair_id) = amount paid
       Dr Customer (Sundry Debtors)               = amount still due (total - paid)
       Balance: total = Σ paid + receivable. Only status = 'Completed' repairs.
       ========================================================= */

    -- G.Cr  Repair Charges Income = total_amount
    SELECT ${REPAIR_INCOME_LEDGER}, 0, COALESCE(jr.total_amount, 0),
           jr.date::date, jr.repair_code::text
    FROM jewel_repairs jr
    WHERE jr.deleted_at IS NULL AND jr.is_active = true AND jr.status = 'Completed'
      AND (:branch_id IS NULL OR jr.branch_id = :branch_id)
      AND jr.date BETWEEN :from_date AND :to_date

    UNION ALL

    -- G.Dr  payment-mode ledger for repair payments
    SELECT
      CASE
        WHEN p.payment_mode = 'Cash' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Cash in Hand'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode = 'UPI' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode = 'Card' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode IN ('Bank Transfer','Cheque') THEN ${BANK_LEDGER}
      END,
      COALESCE(p.amount_received, 0), 0, jr.date::date, jr.repair_code::text
    FROM payments p
    JOIN jewel_repairs jr ON jr.id = p.jewel_repair_id AND jr.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.status = 'Completed'
      AND jr.is_active = true AND jr.status = 'Completed'
      AND p.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR jr.branch_id = :branch_id)
      AND jr.date BETWEEN :from_date AND :to_date

    UNION ALL

    -- G.Dr  Customer receivable (Sundry Debtors) = total_amount - paid
    --  GROSS then SETTLED, for the same reason as A.Dr8a/A.Cr5: same net,
    --  but the statement shows the repair and the collection separately.
    SELECT lc.id, COALESCE(jr.total_amount,0), 0,
           jr.date::date, jr.repair_code::text
    FROM jewel_repairs jr
    JOIN customers c ON c.id = jr.customer_id
    JOIN ledger lc ON lc.id = c.ledger_id AND lc.deleted_at IS NULL
    WHERE jr.deleted_at IS NULL AND jr.is_active = true AND jr.status = 'Completed'
      AND (:branch_id IS NULL OR jr.branch_id = :branch_id)
      AND jr.date BETWEEN :from_date AND :to_date

    UNION ALL

    -- G.Cr  Customer settlement on a repair (counterpart of G.Dr payment legs)
    SELECT lc.id, 0, COALESCE(p.amount_received, 0),
           jr.date::date, jr.repair_code::text
    FROM payments p
    JOIN jewel_repairs jr ON jr.id = p.jewel_repair_id AND jr.deleted_at IS NULL
    JOIN customers c ON c.id = jr.customer_id
    JOIN ledger lc ON lc.id = c.ledger_id AND lc.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.status = 'Completed'
      AND jr.is_active = true AND jr.status = 'Completed'
      AND p.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR jr.branch_id = :branch_id)
      AND jr.date BETWEEN :from_date AND :to_date
  )
`;

// ─────────────────────────────────────────
// LEDGER STATEMENT (the trial balance's drill-down)
//
// The SAME postings the trial balance aggregates, listed row by row instead of
// summed, so /report/ledger-account can never disagree with
// /financial-report/trial-balance. reportService used to hand-roll its own
// subset of these legs and had drifted: 15 ledgers could not be reported at all
// (Stone Purchase Cost, both GST sides, the two Round Offs, Purchase Return,
// Old Gold Purchase, UPI/Card/Bank collections, …) and 67 more disagreed with
// the trial balance, because a leg the copy omitted is a leg that never posts.
//
// Zero rows are dropped. Several legs are GREATEST(...)/percentage expressions
// that legitimately evaluate to 0 for most documents (round-off on an exact
// bill, IGST on an intra-state GRN), and keeping them would bury the real
// entries under thousands of ₹0.00 lines. It cannot hide a ledger that has
// activity: only the individual no-op rows go.
const LEDGER_STATEMENT_SELECT = `
  SELECT
    t.txn_date     AS date,
    t.reference_no AS reference_no,
    t.ledger_id    AS ledger_id,
    l.ledger_name  AS ledger_name,
    t.debit        AS debit,
    t.credit       AS credit
  FROM all_txns t
  JOIN ledger l ON l.id = t.ledger_id AND l.deleted_at IS NULL
  WHERE (COALESCE(t.debit, 0) <> 0 OR COALESCE(t.credit, 0) <> 0)
    AND (:ledger_id IS NULL OR t.ledger_id = :ledger_id)
`;

// Statement SQL with no ORDER BY / LIMIT, so a caller can order it, paginate it,
// or wrap it in COUNT(*). Takes :branch_id, :from_date, :to_date, :ledger_id.
const buildLedgerStatementSql = () => `${ALL_TXNS_CTE}${LEDGER_STATEMENT_SELECT}`;

// Aggregation query that uses all_txns CTE and joins to ledger hierarchy
const LEDGER_AGG_SELECT = `
  SELECT
    lg.id          AS group_id,
    lg.ledger_group_name AS group_name,
    la.account_name AS account_type,
    la.normal_balance,
    l.id           AS ledger_id,
    l.ledger_name,
    COALESCE(SUM(t.debit), 0)  AS total_debit,
    COALESCE(SUM(t.credit), 0) AS total_credit
  FROM ledger l
  JOIN ledger_group lg ON lg.id = l.ledger_group_id
  JOIN ledger_accounts la ON la.id = lg.ledger_account_id
  LEFT JOIN all_txns t ON t.ledger_id = l.id
  WHERE l.deleted_at IS NULL
    AND lg.deleted_at IS NULL
`;

// Executes the shared aggregation and returns raw rows grouped by ledger_group
async function fetchLedgerAggregates(branchId, fromDate, toDate, searchFilter) {
  const whereSearch = searchFilter
    ? `AND (l.ledger_name ILIKE '%' || :search || '%' OR lg.ledger_group_name ILIKE '%' || :search || '%')`
    : "";

  const sql = `
    ${ALL_TXNS_CTE}
    ${LEDGER_AGG_SELECT}
    ${whereSearch}
    GROUP BY lg.id, lg.ledger_group_name, la.account_name, la.normal_balance, l.id, l.ledger_name
    ORDER BY lg.ledger_group_name, l.ledger_name
  `;

  return sequelize.query(sql, {
    replacements: {
      branch_id: branchId,
      from_date: fromDate,
      to_date: toDate,
      ...(searchFilter && { search: searchFilter }),
    },
    type: sequelize.QueryTypes.SELECT,
  });
}

// Fetches the whole ledger_group chart with its nature + parent links, so a
// report can build the nested group tree (Current Assets -> Bank Accounts -> …).
// The chart is shared (branch 1), so it is NOT filtered by the report's branch.
async function fetchGroupTree() {
  return sequelize.query(
    `SELECT lg.id, lg.ledger_group_name, lg.parent_group_id,
            la.account_name AS account_type, la.normal_balance
       FROM ledger_group lg
       LEFT JOIN ledger_accounts la ON la.id = lg.ledger_account_id
       WHERE lg.deleted_at IS NULL`,
    { type: sequelize.QueryTypes.SELECT }
  );
}

// Rounds to 2 decimals and returns a Number. The trial-balance report table
// renders values with `.toLocaleString()`, so debit/credit must stay numeric.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Conventional ordering of account natures for a trial balance.
const NATURE_ORDER = { Liability: 1, Asset: 2, Income: 3, Expense: 4 };

// Collapses flat rows into a map of groups with their ledger children
function buildGroupMap(rows) {
  const groupMap = new Map();
  for (const row of rows) {
    const debit = parseFloat(row.total_debit || 0);
    const credit = parseFloat(row.total_credit || 0);

    if (!groupMap.has(row.group_id)) {
      groupMap.set(row.group_id, {
        group_id: row.group_id,
        group_name: row.group_name,
        account_type: row.account_type,
        normal_balance: row.normal_balance,
        group_debit: 0,
        group_credit: 0,
        ledgers: [],
      });
    }

    const g = groupMap.get(row.group_id);
    g.group_debit += debit;
    g.group_credit += credit;
    g.ledgers.push({
      ledger_id: row.ledger_id,
      ledger_name: row.ledger_name,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
    });
  }
  return groupMap;
}

// Builds the NESTED group tree for the balance sheet: attaches each ledger's
// balance to its immediate group, links child groups to their parents, then
// rolls totals up bottom-first so a parent's total includes all descendants.
// Returns { roots } — the top-level groups (parent_group_id = NULL).
function buildGroupTree(ledgerRows, groups) {
  const node = new Map();
  for (const g of groups) {
    node.set(g.id, {
      id: g.id,
      group_name: g.ledger_group_name,
      parent_group_id: g.parent_group_id,
      account_type: g.account_type,
      normal_balance: g.normal_balance,
      ledgers: [], // direct leaf ledgers of THIS group
      children: [], // nested sub-groups
      selfDebit: 0,
      selfCredit: 0,
      totalDebit: 0,
      totalCredit: 0,
    });
  }

  // Attach each ledger's net to its immediate group.
  for (const row of ledgerRows) {
    const n = node.get(row.group_id);
    if (!n) continue;
    const debit = parseFloat(row.total_debit || 0);
    const credit = parseFloat(row.total_credit || 0);
    n.selfDebit += debit;
    n.selfCredit += credit;
    n.ledgers.push({
      ledger_id: row.ledger_id,
      ledger_name: row.ledger_name,
      debit,
      credit,
    });
  }

  // Link children to parents; anything without a (resolvable) parent is a root.
  const roots = [];
  for (const n of node.values()) {
    if (n.parent_group_id && node.has(n.parent_group_id)) {
      node.get(n.parent_group_id).children.push(n);
    } else {
      roots.push(n);
    }
  }

  // Roll up: a node's total = its own ledgers + every child's rolled-up total.
  const rollup = (n) => {
    let d = n.selfDebit;
    let c = n.selfCredit;
    for (const child of n.children) {
      rollup(child);
      d += child.totalDebit;
      c += child.totalCredit;
    }
    n.totalDebit = d;
    n.totalCredit = c;
  };
  roots.forEach(rollup);

  return { roots };
}

// ─────────────────────────────────────────
// STOCK POSITION  (opening / closing stock)
//
// The ledger-driven statements have NO stock leg: every GRN is charged straight
// to Purchase Accounts and is never relieved when the metal is sold. So the
// Trading Account matches the FULL purchase cost against sales and reports the
// unsold vault as a gross LOSS. Closing stock is the missing credit — and the
// same figure is the missing Current Asset on the balance sheet.
//
// Ported from getProfitSection (superAdminDashboardService): same three source
// aggregations — GRN weight+value, sales-item weight, weighted-average cost —
// but driven off the REPORT's date window instead of the dashboard's static
// 27-Jan-2026 capital cutoff:
//
//   getProfitSection : total stock = capital + purchase - sales
//                      (capital = GRNs before the cutoff, purchase = after it)
//   here             : capital + purchase IS "every GRN up to :as_of", so the
//                      cutoff cancels out of the sum and the identity holds for
//                      ANY date. Pass the report's to_date for CLOSING stock,
//                      and (from_date - 1 day) for OPENING stock.
//
// This also removes a double-count that the dashboard version is exposed to:
// its purchase leg has no lower bound, so any window starting before the cutoff
// counts the capital GRNs twice — which on this report, whose default window is
// 2000-01-01 -> today, would fire on every unfiltered load.
//
// VALUATION IS AT WEIGHTED-AVERAGE COST: closing weight x (total GRN value /
// total GRN weight) — the spec's "Average value" formula, generalised the same
// way. getProfitSection's other line, capital_value + purchase_value - SALES
// value, is deliberately NOT what feeds the statements: sales value is the
// RETAIL total (making charges + GST included), so netting it against
// cost-based GRN amounts strips out margin and tax that were never part of
// stock cost and understates the asset. It is still returned as `net_value` so
// the dashboard figure stays available to the client.
// ─────────────────────────────────────────

// as_of date one day before `d` — the instant an opening balance is measured.
const dayBefore = (d) => {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().split("T")[0];
};

async function fetchStockPosition(branchId, asOfDate) {
  const replacements = { branch_id: branchId, as_of: asOfDate };

  const [grnRows, salesRows] = await Promise.all([
    // Every GRN up to :as_of = getProfitSection's capital + purchase legs.
    //
    // grns.total_gross_wt_in_g is a CLIENT-SUPPLIED header total — nothing on
    // the write path derives it from the lines — so a GRN saved without it
    // would silently contribute 0 grams while still contributing its full
    // value, inflating the average cost per gram and shrinking closing stock.
    // Fall back to the line weights when the header is missing or zero.
    // NOTE: grnItems.gross_wt_in_g is a LINE TOTAL, so it is summed plain — it
    // is NOT multiplied by quantity. That is the convention everywhere else in
    // this codebase (grnService, purchaseOrderService, stockManagementService),
    // and it is the opposite of the sales side below, where gross_weight is
    // PER UNIT and must be multiplied out. Both bases are gross weight, so the
    // subtraction is apples-to-apples in grams.
    sequelize.query(
      `
        SELECT
          COALESCE(SUM(
            COALESCE(
              NULLIF(grn.total_gross_wt_in_g, 0),
              (
                SELECT SUM(gi.gross_wt_in_g)
                FROM "grnItems" gi
                WHERE gi.grn_id = grn.id
                  AND gi.deleted_at IS NULL
              ),
              0
            )
          ), 0) AS total_weight_in_grams,
          COALESCE(SUM(grn.total_amount), 0) AS total_value
        FROM grns grn
        WHERE grn.deleted_at IS NULL
          AND grn.is_active = true
          AND grn.grn_date <= :as_of
          AND (:branch_id IS NULL OR grn.branch_id = :branch_id)
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    ),

    // Metal that has LEFT the vault, net of returns — item gross weight x
    // (quantity - returned_quantity), exactly as getProfitSection counts it.
    sequelize.query(
      `
        WITH valid_invoices AS (
          SELECT sib.id, sib.total_amount
          FROM sales_invoice_bills sib
          WHERE sib.deleted_at IS NULL
            AND sib.is_active = true
            AND sib.status = 'Invoice'
            AND sib.invoice_date <= :as_of
            AND (:branch_id IS NULL OR sib.branch_id = :branch_id)
        )
        SELECT
          COALESCE(
            (
              SELECT SUM(
                COALESCE(sii.gross_weight, 0)
                * (COALESCE(sii.quantity, 1) - COALESCE(sii.returned_quantity, 0))
              )
              FROM sales_invoice_bill_items sii
              INNER JOIN valid_invoices vi ON vi.id = sii.invoice_bill_id
              WHERE sii.deleted_at IS NULL
            ),
            0
          ) AS total_weight_in_grams,
          COALESCE((SELECT SUM(vi.total_amount) FROM valid_invoices vi), 0) AS total_value
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    ),
  ]);

  const grn = grnRows[0] || {};
  const sales = salesRows[0] || {};

  const purchasedWeight = Number(grn.total_weight_in_grams || 0);
  const purchasedValue = Number(grn.total_value || 0);
  const soldWeight = Number(sales.total_weight_in_grams || 0);
  const soldValue = Number(sales.total_value || 0);

  // Average value per gram = total GRN value / total GRN weight.
  const averageValuePerGram = purchasedWeight > 0 ? purchasedValue / purchasedWeight : 0;

  // Stock can only be negative when sale weights outrun GRN weights (bad master
  // data, or stock carried in before the system went live). Clamping to 0 keeps
  // a data problem from being reported as a NEGATIVE asset on the balance sheet.
  const rawWeight = purchasedWeight - soldWeight;
  const weight = rawWeight > 0 ? rawWeight : 0;

  return {
    as_of: asOfDate,
    weight_in_grams: round2(weight),
    average_value_per_gram: round2(averageValuePerGram),
    value: round2(weight * averageValuePerGram),
    // getProfitSection's raw line (cost purchases less RETAIL sales), carried
    // for reference only — see the valuation note above.
    net_value: round2(purchasedValue - soldValue),
    purchased_weight_in_grams: round2(purchasedWeight),
    purchased_value: round2(purchasedValue),
    sold_weight_in_grams: round2(soldWeight),
    sold_value: round2(soldValue),
  };
}

// ─────────────────────────────────────────
// TRIAL BALANCE
//
// Aggregates every transaction source (GRN, sales, returns, payments,
// vouchers, scheme payments, journal entries) by ledger, then presents each
// ledger and its parent group as a single NET balance placed on its natural
// side (debit or credit) — the standard grouped trial-balance view.
//
// Response shape (consumed directly by the Trial Balance report table):
//   {
//     rows: [
//       { id, particulars, account_type, normal_balance,
//         debit: number|null, credit: number|null,
//         children: [ { id, particulars, debit, credit } ] }
//     ],
//     summary: { totalDebit, totalCredit, difference },
//     filters: { ... }
//   }
//
// Query params: branch_id, from_date, to_date, search, include_zero
//   - Zero-balance ledgers/groups are hidden unless include_zero=true.
// ─────────────────────────────────────────
const getTrialBalance = async (req, res) => {
  try {
    const { branch_id, from_date, to_date, search, include_zero } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;
    const includeZero = include_zero === "true" || include_zero === "1";

    const ledgerRows = await fetchLedgerAggregates(branchId, fromDate, toDate, search || null);
    const groups = await fetchGroupTree();
    const { roots } = buildGroupTree(ledgerRows, groups);

    // Serialize a node into the NESTED TB shape: each group/ledger shows its own
    // net on its side; `children` holds sub-groups (recursively) then leaf
    // ledgers. Zero nodes (and groups with nothing to show) are pruned unless
    // include_zero.
    const serializeTB = (n) => {
      const children = [];
      for (const c of n.children) {
        const s = serializeTB(c);
        if (s) children.push(s);
      }
      for (const l of n.ledgers) {
        const lnet = l.debit - l.credit;
        if (lnet === 0 && !includeZero) continue;
        children.push({
          id: `l_${l.ledger_id}`,
          particulars: l.ledger_name,
          debit: lnet > 0 ? round2(lnet) : null,
          credit: lnet < 0 ? round2(-lnet) : null,
        });
      }
      const net = n.totalDebit - n.totalCredit;
      if (children.length === 0 && net === 0 && !includeZero) return null;
      return {
        id: `g_${n.id}`,
        particulars: n.group_name,
        debit: net > 0 ? round2(net) : null,
        credit: net < 0 ? round2(-net) : null,
        children,
      };
    };

    roots.sort(
      (a, b) =>
        (NATURE_ORDER[a.account_type] || 9) - (NATURE_ORDER[b.account_type] || 9) ||
        (a.group_name || "").localeCompare(b.group_name || "")
    );

    // Totals are the root-group nets placed on their sides (grouped TB), which
    // balance because the books net to zero overall.
    let totalDebit = 0;
    let totalCredit = 0;
    const data = [];
    for (const n of roots) {
      const s = serializeTB(n);
      if (!s) continue;
      data.push(s);
      const net = n.totalDebit - n.totalCredit;
      if (net > 0) totalDebit += net;
      else totalCredit += -net;
    }

    return commonService.okResponse(res, {
      rows: data,
      summary: {
        totalDebit: round2(totalDebit),
        totalCredit: round2(totalCredit),
        difference: round2(Math.abs(totalDebit - totalCredit)),
      },
      filters: {
        from_date: fromDate,
        to_date: toDate,
        branch_id: branchId,
        search: search || null,
        include_zero: includeZero,
      },
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// ─────────────────────────────────────────
// PROFIT & LOSS
//
// Query params: branch_id, from_date, to_date, include_zero
//   - Ledgers/groups that render as ₹0.00 are hidden unless include_zero=true
//     (same rule as the trial balance).
// ─────────────────────────────────────────
const getProfitLoss = async (req, res) => {
  try {
    const { branch_id, from_date, to_date, include_zero } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;
    const includeZero = include_zero === "true" || include_zero === "1";

    const ledgerRows = await fetchLedgerAggregates(branchId, fromDate, toDate, null);
    const groups = await fetchGroupTree();
    const { roots } = buildGroupTree(ledgerRows, groups);

    // Stock at both ends of the window. Purchases inside the window are already
    // on the debit side via the Purchase Accounts ledgers, so the Trading
    // Account only needs the two stock balances to close the loop:
    //   Gross Profit = (Sales + Closing Stock) - (Opening Stock + Purchases + Direct Expenses)
    const [openingStock, closingStock] = await Promise.all([
      fetchStockPosition(branchId, dayBefore(fromDate)),
      fetchStockPosition(branchId, toDate),
    ]);

    const sections = buildProfitSections(roots, {
      includeZero,
      openingStock,
      closingStock,
    });

    return commonService.okResponse(res, {
      trading_account: {
        debit: sections.tradingDebit,
        debit_total: sections.tradingDebitTotal.toFixed(2),
        credit: sections.tradingCredit,
        credit_total: sections.tradingCreditTotal.toFixed(2),
        gross_profit: sections.grossProfit.toFixed(2),
      },
      pnl_account: {
        debit: sections.pnlDebit,
        debit_total: sections.pnlDebitTotal.toFixed(2),
        credit: sections.pnlCredit,
        credit_total: sections.pnlCreditTotal.toFixed(2),
        net_profit: sections.netProfit.toFixed(2),
      },
      // Weights + the valuation basis behind the two stock rows, so the report
      // can show HOW the closing figure was arrived at.
      stock: {
        opening: openingStock,
        closing: closingStock,
      },
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// Builds the Trading + Profit & Loss sections from an already-built group tree.
//
// Extracted out of getProfitLoss so the BALANCE SHEET can derive the period's
// net result from the exact same arithmetic. Duplicating the calculation there
// would let the two statements disagree on the profit figure, which is the one
// number a reader will cross-check between them first.
function buildProfitSections(roots, { includeZero, openingStock, closingStock }) {
  // A nested P&L entry: the group's own amount plus its sub-groups (recursive)
  // and leaf ledgers. Sub-group children carry `amount` + `children`; ledger
  // children carry `debit`/`credit`.
  //
  // Rows with nothing to report are pruned (returns null) unless include_zero:
  // a chart carries every seeded expense/income head plus every party ledger,
  // and the untouched ones were padding the statement with ₹0.00 lines. The
  // test is on the DISPLAYED amount — round2 of the net, matching the UI's
  // own `Math.abs(debit - credit)` — so a ledger whose debit and credit cancel
  // is hidden too, and float residue never leaves a "₹0.00" row behind. A
  // group is kept whenever a child survives, even if its own net is zero, so
  // offsetting balances under it stay visible.
  const serializePL = (n) => {
    const children = [];
    for (const c of n.children) {
      const s = serializePL(c);
      if (s) children.push(s);
    }
    for (const l of n.ledgers) {
      if (!includeZero && round2(l.debit - l.credit) === 0) continue;
      children.push({
        particulars: l.ledger_name,
        debit: (l.debit || 0).toFixed(2),
        credit: (l.credit || 0).toFixed(2),
      });
    }
    const amount = Math.abs(n.totalDebit - n.totalCredit);
    if (!includeZero && children.length === 0 && round2(amount) === 0) return null;
    return {
      particulars: n.group_name,
      amount: amount.toFixed(2),
      children,
    };
  };

  const tradingDebit = [];   // Purchase, Direct Expenses
  const tradingCredit = [];  // Sales, Direct Income
  const pnlDebit = [];       // Indirect Expenses
  const pnlCredit = [];      // Indirect Income

  for (const n of roots) {
    const name = (n.group_name || "").toLowerCase();
    const entry = serializePL(n);
    // A whole head that never moved (e.g. Direct Income with only zero
    // ledgers) drops off its side. Totals are unaffected — it contributed 0.
    if (!entry) continue;
    if (n.account_type === "Expense") {
      (name.includes("indirect") ? pnlDebit : tradingDebit).push(entry);
    } else if (n.account_type === "Income") {
      (name.includes("indirect") ? pnlCredit : tradingCredit).push(entry);
    }
  }

  // Stock lines are computed, not posted, so they are appended after the
  // ledger heads — opening FIRST on the debit side and closing LAST on the
  // credit side, the conventional Trading Account layout. Both are pruned at
  // zero like every other row, so a window with no stock either side is
  // rendered exactly as it is today.
  const stockRow = (particulars, amount) => ({
    particulars,
    amount: amount.toFixed(2),
    children: [],
  });

  if (includeZero || round2(openingStock.value) !== 0) {
    tradingDebit.unshift(stockRow("Opening Stock", openingStock.value));
  }
  if (includeZero || round2(closingStock.value) !== 0) {
    tradingCredit.push(stockRow("Closing Stock", closingStock.value));
  }

  const sumAmt = (arr) => arr.reduce((s, e) => s + parseFloat(e.amount), 0);
  const tradingDebitTotal = sumAmt(tradingDebit);
  const tradingCreditTotal = sumAmt(tradingCredit);
  const pnlDebitTotal = sumAmt(pnlDebit);
  const pnlCreditTotal = sumAmt(pnlCredit);

  // Gross Profit / Loss plugged into the second section
  const grossProfit = tradingCreditTotal - tradingDebitTotal;
  const netProfit = grossProfit + pnlCreditTotal - pnlDebitTotal;

  return {
    tradingDebit,
    tradingDebitTotal,
    tradingCredit,
    tradingCreditTotal,
    pnlDebit,
    pnlDebitTotal,
    pnlCredit,
    pnlCreditTotal,
    grossProfit,
    netProfit,
  };
}

// ─────────────────────────────────────────
// BALANCE SHEET
//
// Query params: branch_id, from_date, to_date, include_zero
//   - Ledgers/groups that render as ₹0.00 are hidden unless include_zero=true
//     (same rule as the trial balance).
// ─────────────────────────────────────────
const getBalanceSheet = async (req, res) => {
  try {
    const { branch_id, from_date, to_date, include_zero } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;
    const includeZero = include_zero === "true" || include_zero === "1";

    const ledgerRows = await fetchLedgerAggregates(branchId, fromDate, toDate, null);
    const groups = await fetchGroupTree();
    const { roots } = buildGroupTree(ledgerRows, groups);

    // The asset row needs only the CLOSING position (a balance sheet is a
    // point-in-time statement, measured at to_date — the same figure the
    // Trading Account credits). Opening stock is fetched too because the
    // period's net result, carried into Capital Account below, is computed from
    // both ends exactly as the P&L computes it.
    const [openingStock, closingStock] = await Promise.all([
      fetchStockPosition(branchId, dayBefore(fromDate)),
      fetchStockPosition(branchId, toDate),
    ]);

    // NO NEGATIVE MAY REACH THE STATEMENT (client requirement). Reclassify
    // rather than sign-flip.
    //
    // bae0d34 met the requirement with Math.abs, which reads a debtor sitting
    // at -200 as +200. That hides the sign but INVENTS 400 of value: the books
    // say the balance is 200 on the OTHER side, so the sheet moves by twice the
    // amount and stops balancing. Rounding was collateral damage too — round2
    // was doing double duty there, and without it the zero tests below compared
    // raw float residue (5.5e-17 !== 0), letting every settled party this
    // pruning exists to hide back in as a "₹0.00" row.
    //
    // A contra balance is not a negative asset, it is a balance of the OPPOSITE
    // NATURE: a debtor in credit is money owed TO the customer (an advance
    // received), an overdrawn bank is a loan. So move it across instead — the
    // standard treatment, and what Tally does. Both goals are then met at once:
    //
    //   moving -X off assets and showing it as +X on liabilities leaves
    //   (assets - liabilities) unchanged, so the sheet still balances, and
    //   every figure printed is positive because it now sits on its own side.
    //
    // Done at LEAF level, before any rollup: once every surviving leaf is
    // natural-side-positive, every group total is a sum of positives, so no
    // negative can appear at any depth. The invariant is asserted below.
    const contraToLiability = []; // asset ledgers in credit  -> liabilities
    const contraToAsset = [];     // liability ledgers in debit -> assets

    const extractContra = (n, side) => {
      const keep = [];
      for (const l of n.ledgers) {
        const net = round2(side === "asset" ? l.debit - l.credit : l.credit - l.debit);
        if (net < 0) {
          (side === "asset" ? contraToLiability : contraToAsset).push({
            ledger_id: l.ledger_id,
            ledger_name: l.ledger_name,
            amount: -net, // positive magnitude on its true side
            reclassified_from: n.group_name,
          });
        } else {
          keep.push(l);
        }
      }
      n.ledgers = keep;
      for (const c of n.children) extractContra(c, side);
    };

    // Totals were rolled up by buildGroupTree over ALL leaves, so they have to
    // be rebuilt from the leaves that survived the extraction.
    const reRollup = (n) => {
      let d = 0;
      let c = 0;
      for (const l of n.ledgers) {
        d += l.debit;
        c += l.credit;
      }
      for (const child of n.children) {
        reRollup(child);
        d += child.totalDebit;
        c += child.totalCredit;
      }
      n.totalDebit = d;
      n.totalCredit = c;
    };

    for (const n of roots) {
      if (n.account_type === "Asset") {
        extractContra(n, "asset");
        reRollup(n);
      } else if (n.account_type === "Liability") {
        extractContra(n, "liability");
        reRollup(n);
      }
    }

    // Serialize a group node into the NESTED balance-sheet shape, placing every
    // amount on its natural side (assets = debit-positive, liabilities =
    // credit-positive). `children` are nested sub-groups; `ledgers` are the
    // group's own leaf ledgers.
    //
    // Signed arithmetic is correct here BECAUSE of the extraction above — no
    // Math.abs needed, and none wanted: if a negative ever did survive, it
    // should be visible as a bug rather than silently doubled into the totals.
    //
    // Settled/untouched rows are pruned (returns null) unless include_zero.
    // This matters most here: Sundry Debtors/Creditors hold one leaf per
    // customer and vendor, and every party who has never transacted — or whose
    // account is fully settled — was listed at ₹0.00. A group survives as long
    // as one descendant does, so a zero-net group with offsetting children is
    // still shown.
    const serialize = (n, side) => {
      const children = [];
      for (const c of n.children) {
        const s = serialize(c, side);
        if (s) children.push(s);
      }
      const ledgers = [];
      for (const l of n.ledgers) {
        const amt = round2(side === "asset" ? l.debit - l.credit : l.credit - l.debit);
        if (!includeZero && amt === 0) continue;
        ledgers.push({ ledger_id: l.ledger_id, ledger_name: l.ledger_name, amount: amt });
      }
      const amount = round2(
        side === "asset" ? n.totalDebit - n.totalCredit : n.totalCredit - n.totalDebit
      );
      if (!includeZero && children.length === 0 && ledgers.length === 0 && amount === 0) {
        return null;
      }
      return {
        group_id: n.id,
        group_name: n.group_name,
        amount,
        children,
        ledgers,
      };
    };

    const liabilities = [];
    const assets = [];
    let totalLiabilities = 0;
    let totalAssets = 0;

    // Only TOP-LEVEL groups drive the two sides; sub-groups nest inside them.
    // A pruned head contributed 0, so the side totals are unchanged by hiding it.
    for (const n of roots) {
      if (n.account_type === "Asset") {
        const entry = serialize(n, "asset");
        if (!entry) continue;
        assets.push(entry);
        totalAssets += entry.amount;
      } else if (n.account_type === "Liability") {
        const entry = serialize(n, "liability");
        if (!entry) continue;
        liabilities.push(entry);
        totalLiabilities += entry.amount;
      }
    }

    // Closing stock is a COMPUTED balance, not a ledger posting, so the seeded
    // 'Stock in Hand' group (Gold/Silver/Stone Stock leaves) aggregates to zero
    // and gets pruned above — which is why the balance sheet shows no stock at
    // all today. Attach the figure to that group when it exists in the chart so
    // it lands in its proper place, and fall back to a synthetic head if the
    // chart was never seeded with it.
    const closingStockValue = round2(closingStock.value);

    if (includeZero || closingStockValue !== 0) {
      const stockLedger = {
        ledger_id: null,
        ledger_name: "Closing Stock",
        amount: closingStockValue,
      };
      const stockNode = roots.find(
        (n) =>
          n.account_type === "Asset" &&
          (n.group_name || "").toLowerCase() === "stock in hand"
      );
      const existing = stockNode ? assets.find((a) => a.group_id === stockNode.id) : null;

      if (existing) {
        existing.ledgers.push(stockLedger);
        existing.amount = round2(existing.amount + closingStockValue);
      } else {
        assets.push({
          group_id: stockNode ? stockNode.id : null,
          group_name: stockNode ? stockNode.group_name : "Stock in Hand",
          amount: closingStockValue,
          children: [],
          ledgers: [stockLedger],
        });
      }
      totalAssets += closingStockValue;
    }

    // The contra balances pulled out above, presented on the side they actually
    // belong to. Each row keeps `reclassified_from` so a reader can see that
    // "Advance Customer" under here is the same party they expected to find
    // under Sundry Debtors, rather than wondering where the balance went.
    const contraGroup = (list, groupName) => ({
      group_id: null,
      group_name: groupName,
      amount: round2(list.reduce((s, l) => s + l.amount, 0)),
      children: [],
      ledgers: list.map((l) => ({ ...l, amount: round2(l.amount) })),
    });

    if (contraToLiability.length) {
      const entry = contraGroup(contraToLiability, "Advances & Credit Balances");
      liabilities.push(entry);
      totalLiabilities += entry.amount;
    }
    if (contraToAsset.length) {
      const entry = contraGroup(contraToAsset, "Advances & Debit Balances");
      assets.push(entry);
      totalAssets += entry.amount;
    }

    // Assets = Liabilities + Capital + (Income - Expenses).
    //
    // The loop above walks ONLY the Asset and Liability roots — the period's
    // RESULT lives in the Income/Expense roots and was never carried anywhere,
    // so the two sides could not balance even before closing stock existed.
    // (`grand_total` took Math.max of the two, which hid the gap rather than
    // closing it.) Post the SAME net profit the P&L reports into Capital
    // Account and the statement closes.
    //
    // The figure is SIGNED: a net loss reduces capital, so it is carried as a
    // negative rather than being flipped to the asset side. Reusing
    // buildProfitSections is what guarantees the two reports never disagree.
    const { netProfit } = buildProfitSections(roots, {
      includeZero,
      openingStock,
      closingStock,
    });
    const netResult = round2(netProfit);

    if (netResult < 0) {
      // A LOSS is reclassified exactly like a contra ledger: it belongs on the
      // ASSETS side at positive magnitude, not under Capital as a negative.
      // Same arithmetic as above — moving -X off liabilities and showing +X on
      // assets leaves the two sides equally apart — and it is the conventional
      // Indian balance-sheet layout, where accumulated losses sit on the assets
      // side until reserves absorb them.
      const entry = {
        group_id: null,
        group_name: "Profit & Loss A/c",
        amount: -netResult,
        children: [],
        ledgers: [{ ledger_id: null, ledger_name: "Net Loss", amount: -netResult }],
      };
      assets.push(entry);
      totalAssets += entry.amount;
    } else if (includeZero || netResult !== 0) {
      const resultLedger = {
        ledger_id: null,
        ledger_name: "Net Profit",
        amount: netResult,
      };
      const capitalNode = roots.find(
        (n) =>
          n.account_type === "Liability" &&
          (n.group_name || "").toLowerCase() === "capital account"
      );
      const existingCapital = capitalNode
        ? liabilities.find((l) => l.group_id === capitalNode.id)
        : null;

      if (existingCapital) {
        existingCapital.ledgers.push(resultLedger);
        existingCapital.amount = round2(existingCapital.amount + netResult);
      } else {
        liabilities.push({
          group_id: capitalNode ? capitalNode.id : null,
          group_name: capitalNode ? capitalNode.group_name : "Capital Account",
          amount: netResult,
          children: [],
          ledgers: [resultLedger],
        });
      }
      totalLiabilities += netResult;
    }

    const roundedLiabilities = round2(totalLiabilities);
    const roundedAssets = round2(totalAssets);

    return commonService.okResponse(res, {
      liabilities,
      assets,
      total_liabilities: roundedLiabilities.toFixed(2),
      total_assets: roundedAssets.toFixed(2),
      grand_total: Math.max(roundedLiabilities, roundedAssets).toFixed(2),
      // Weights + valuation basis behind the Closing Stock asset row.
      stock: { opening: openingStock, closing: closingStock },
      // Surfaced so a caller can SEE whether the sheet actually balanced rather
      // than inferring it from grand_total, which reports the larger side.
      //
      // Expect 0.00 on a full-range report — contra balances and losses are
      // reclassified across sides, which preserves the identity, so neither
      // knocks it off any more. The remaining way it goes non-zero is a
      // NARROWED date range: fetchLedgerAggregates windows every ledger, so a
      // from_date later than the first transaction yields movements rather than
      // true opening balances, while closing stock is a real as-of figure.
      difference: round2(roundedAssets - roundedLiabilities).toFixed(2),
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// ═════════════════════════════════════════════════════════════════════════
// GSTR-1
//
// Reads the invoice-time snapshot columns on sales_invoice_bills
// (customer_gstin, place_of_supply, gstr1_category, …) populated at save time,
// and falls back to the live customer/branch/state masters (COALESCE) for any
// row created before those columns existed. Credit notes come from
// sales_returns; advances from voucher_receipts (bill_type_id = 3).
// ═════════════════════════════════════════════════════════════════════════

// Effective values: prefer the snapshot, fall back to the live master.
const EFF_GSTIN = `NULLIF(TRIM(COALESCE(s.customer_gstin, c.gst_no, '')), '')`;
const EFF_POS = `COALESCE(s.place_of_supply, cst.state_name, bst.state_name)`;
const GST_RATE = `(COALESCE(s.cgst_percent,0) + COALESCE(s.sgst_percent,0) + COALESCE(s.igst_percent,0))`;

// Gross document value = taxable value + tax. This is the GSTR-1 "invoice value"
// and the basis for the B2CL >= 250000 threshold. NOTE: it is deliberately NOT
// s.total_amount, which is stored NET of old-gold / scheme / sales-return
// adjustments (common & large in jewellery) — using that would understate the
// invoice value and mis-bucket large inter-state B2C invoices out of B2CL.
const INV_VALUE = `(COALESCE(s.subtotal_amount,0) + COALESCE(s.cgst_amount,0) + COALESCE(s.sgst_amount,0) + COALESCE(s.igst_amount,0))`;

// Resolve the GSTR-1 bucket, falling back to a live derivation if the snapshot
// is null (rows created before the snapshot columns / backfill).
const EFF_CATEGORY = `
  COALESCE(s.gstr1_category::text, CASE
    WHEN s.is_export = true THEN 'EXP'
    WHEN COALESCE(s.supply_type,'Taxable') <> 'Taxable' THEN 'EXEMP'
    WHEN ${EFF_GSTIN} IS NOT NULL THEN 'B2B'
    WHEN COALESCE(s.igst_amount,0) > 0 AND ${INV_VALUE} >= 250000 THEN 'B2CL'
    ELSE 'B2CS'
  END)`;

// Invoice source (posted invoices only) with all masters joined.
const INVOICE_BASE = `
  FROM sales_invoice_bills s
  LEFT JOIN customers c   ON c.id = s.customer_id
  LEFT JOIN branches  b   ON b.id = s.branch_id
  LEFT JOIN states    cst ON cst.id = c.state_id
  LEFT JOIN states    bst ON bst.id = b.state_id
  WHERE s.deleted_at IS NULL
    AND s.status = 'Invoice'
    AND (:branch_id IS NULL OR s.branch_id = :branch_id)
    AND s.invoice_date BETWEEN :from_date AND :to_date`;

// Credit-note source (sales returns) with masters + original invoice ref.
const RET_GSTIN = `NULLIF(TRIM(COALESCE(c.gst_no, '')), '')`;
const RET_POS = `COALESCE(cst.state_name, bst.state_name)`;
// A credit note should carry the SAME GST rate as the original invoice. The
// percent columns on sales_returns are only stored when the client sends them,
// so when they are null/0 we derive the rate from the tax amounts actually
// booked on the return (tax / taxable * 100) — e.g. a 3% return shows 3%, not 0%.
const RET_RATE = `
  CASE
    WHEN (COALESCE(r.cgst_percent,0) + COALESCE(r.sgst_percent,0) + COALESCE(r.igst_percent,0)) > 0
      THEN (COALESCE(r.cgst_percent,0) + COALESCE(r.sgst_percent,0) + COALESCE(r.igst_percent,0))
    WHEN COALESCE(r.subtotal_amount,0) > 0
      THEN (COALESCE(r.cgst_amount,0) + COALESCE(r.sgst_amount,0) + COALESCE(r.igst_amount,0)) / r.subtotal_amount * 100
    ELSE 0
  END`;
const RETURN_BASE = `
  FROM sales_returns r
  LEFT JOIN customers c   ON c.id = r.customer_id
  LEFT JOIN branches  b   ON b.id = r.branch_id
  LEFT JOIN states    cst ON cst.id = c.state_id
  LEFT JOIN states    bst ON bst.id = b.state_id
  LEFT JOIN (
    SELECT sales_return_id, MIN(invoice_no) AS orig_invoice_no
    FROM sales_return_items WHERE deleted_at IS NULL
    GROUP BY sales_return_id
  ) ri ON ri.sales_return_id = r.id
  WHERE r.deleted_at IS NULL AND r.is_active = true
    AND r.status NOT IN ('Draft','Cancelled','On Hold')
    AND (:branch_id IS NULL OR r.branch_id = :branch_id)
    AND r.return_date BETWEEN :from_date AND :to_date`;

// Advance-receipt source — CUSTOMER advances only (user_type_id = 2 excludes
// vendor advances, which are inward, not outward supplies).
const ADV_POS = `COALESCE(cst.state_name, bst.state_name)`;
const ADV_BASE = `
  FROM voucher_receipts vr
  LEFT JOIN customers c   ON c.ledger_id = vr.account_id AND c.deleted_at IS NULL
  LEFT JOIN branches  b   ON b.id = vr.branch_id
  LEFT JOIN states    cst ON cst.id = c.state_id
  LEFT JOIN states    bst ON bst.id = b.state_id
  WHERE vr.deleted_at IS NULL AND vr.is_active = true
    AND vr.bill_type_id = 3
    AND COALESCE(vr.user_type_id, 2) = 2
    AND (:branch_id IS NULL OR vr.branch_id = :branch_id)
    AND vr.receipt_date BETWEEN :from_date AND :to_date`;

const yn = (v) => (v === true ? "Y" : "N");

// ─────────────────────────────────────────
// GSTR1 — INVOICE VIEW (flat list of every posted invoice in the period)
// ─────────────────────────────────────────
const getGstr1 = async (req, res) => {
  try {
    const { branch_id, from_date, to_date } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;
    const replacements = { branch_id: branchId, from_date: fromDate, to_date: toDate };

    // Company header (branch GSTIN + name) — only when a single branch is chosen.
    let gstin = null;
    let legalName = null;
    if (branchId) {
      const rows = await sequelize.query(
        `SELECT gst_no, branch_name FROM branches WHERE id = :branch_id AND deleted_at IS NULL LIMIT 1`,
        { replacements: { branch_id: branchId }, type: sequelize.QueryTypes.SELECT }
      );
      if (rows.length) {
        gstin = rows[0].gst_no;
        legalName = rows[0].branch_name;
      }
    }

    // Register view = three Transaction Types: posted sales invoices, credit
    // notes (sales returns) and old-gold (old jewels) intake. Credit notes / old
    // gold have no snapshot place_of_supply_code, and old gold carries no GST.
    const sql = `
      SELECT * FROM (
        -- Sales invoices
        SELECT
          s.invoice_date                        AS sort_date,
          ${EFF_GSTIN}                          AS gstin_uin,
          c.customer_name                       AS party_name,
          'Sales'                               AS transaction_type,
          s.invoice_no                          AS invoice_no,
          TO_CHAR(s.invoice_date, 'DD/MM/YYYY') AS invoice_date,
          ${INV_VALUE}                          AS invoice_value,
          ${GST_RATE}                           AS rate,
          COALESCE(s.subtotal_amount, 0)        AS taxable_value,
          s.reverse_charge                      AS reverse_charge,
          COALESCE(s.cgst_amount, 0)            AS cgst_amount,
          COALESCE(s.sgst_amount, 0)            AS sgst_amount,
          COALESCE(s.igst_amount, 0)            AS igst_amount,
          ${EFF_POS}                            AS place_of_supply,
          s.place_of_supply_code                AS place_of_supply_code,
          b.branch_name                         AS branch
        ${INVOICE_BASE}

        UNION ALL

        -- Credit notes (sales returns)
        SELECT
          r.return_date,
          ${RET_GSTIN},
          c.customer_name,
          'Credit Note',
          r.sales_return_no,
          TO_CHAR(r.return_date, 'DD/MM/YYYY'),
          COALESCE(r.total_amount, 0),
          ${RET_RATE},
          COALESCE(r.subtotal_amount, 0),
          false,
          COALESCE(r.cgst_amount, 0),
          COALESCE(r.sgst_amount, 0),
          COALESCE(r.igst_amount, 0),
          ${RET_POS},
          NULL,
          b.branch_name
        ${RETURN_BASE}

        UNION ALL

        -- Old gold (old jewels) intake — no GST on purchase from individuals
        SELECT
          oj.date,
          NULL,
          c.customer_name,
          'Old Gold',
          oj.old_jewel_code,
          TO_CHAR(oj.date, 'DD/MM/YYYY'),
          COALESCE(oj.total_amount, 0),
          0,
          COALESCE(oj.total_amount, 0),
          false,
          0, 0, 0,
          COALESCE(cst.state_name, bst.state_name),
          NULL,
          b.branch_name
        FROM old_jewels oj
        LEFT JOIN customers c   ON c.id = oj.customer_id
        LEFT JOIN branches  b   ON b.id = oj.branch_id
        LEFT JOIN states    cst ON cst.id = c.state_id
        LEFT JOIN states    bst ON bst.id = b.state_id
        WHERE oj.deleted_at IS NULL
          AND (:branch_id IS NULL OR oj.branch_id = :branch_id)
          AND oj.date BETWEEN :from_date AND :to_date
      ) u
      ORDER BY u.sort_date ASC NULLS LAST, u.invoice_no ASC
    `;

    const data = await sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });

    return commonService.okResponse(res, {
      gstin,
      legal_name: legalName,
      trade_name: legalName,
      aggregate_turnover_prev_fy: null,
      aggregate_turnover_apr_jun: null,
      data: data.map((row) => ({
        gstin_uin: row.gstin_uin || null,
        party_name: row.party_name,
        transaction_type: row.transaction_type,
        invoice_no: row.invoice_no,
        invoice_date: row.invoice_date,
        invoice_value: round2(row.invoice_value),
        rate: round2(row.rate),
        cess_rate: 0,
        taxable_value: round2(row.taxable_value),
        reverse_charge: yn(row.reverse_charge),
        igst: round2(row.igst_amount),
        cgst: round2(row.cgst_amount),
        sgst: round2(row.sgst_amount),
        cess_amount: 0,
        place_of_supply: row.place_of_supply || null,
        place_of_supply_code: row.place_of_supply_code || null,
        branch: row.branch || null,
      })),
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// ─────────────────────────────────────────
// GSTR1 — PORTAL VIEW (all 13 sections)
//   sections: b2b, b2cl, b2cs, cdnr, cdnur, exp, at, atadj, exemp,
//             hsn_b2b, hsn_b2c, item_summary, docs
// ─────────────────────────────────────────
const getGstr1Portal = async (req, res) => {
  try {
    const { branch_id, from_date, to_date } = req.query;
    const section = String(req.query.section || "b2b").toLowerCase();
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;
    const replacements = { branch_id: branchId, from_date: fromDate, to_date: toDate };

    const q = (sql) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
    const sum = (rows, key) => rows.reduce((a, r) => a + parseFloat(r[key] || 0), 0);

    // ── B2B, SEZ, DE (4A, 4B, 6B, 6C) ──────────────────────────────────────
    if (section === "b2b") {
      const rows = await q(`
        SELECT
          ${EFF_GSTIN} AS gstin, c.customer_name AS receiver_name, s.invoice_no,
          TO_CHAR(s.invoice_date,'DD/MM/YYYY') AS invoice_date,
          ${INV_VALUE} AS invoice_value, ${EFF_POS} AS place_of_supply,
          s.reverse_charge, ${GST_RATE} AS rate, COALESCE(s.subtotal_amount,0) AS taxable_value,
          b.branch_name AS branch
        ${INVOICE_BASE} AND ${EFF_CATEGORY} = 'B2B'
        ORDER BY s.invoice_date ASC, s.invoice_no ASC
      `);
      const gstins = new Set(rows.map((r) => r.gstin).filter(Boolean));
      return commonService.okResponse(res, {
        section: "b2b",
        summary: {
          no_of_receipt: gstins.size,
          no_of_invoice: rows.length,
          total_invoice_value: round2(sum(rows, "invoice_value")),
          total_taxable_value: round2(sum(rows, "taxable_value")),
          total_cess: 0,
        },
        data: rows.map((r) => ({
          gstin: r.gstin || null,
          receiver_name: r.receiver_name,
          invoice_no: r.invoice_no,
          invoice_date: r.invoice_date,
          invoice_value: round2(r.invoice_value),
          place_of_supply: r.place_of_supply || null,
          reverse_charge: yn(r.reverse_charge),
          applicable_tax_rate: null,
          transaction_type: "Invoice",
          ecommerce_gstin: null,
          rate: round2(r.rate),
          taxable_value: round2(r.taxable_value),
          cess_amount: 0,
          branch: r.branch || null,
        })),
      });
    }

    // ── B2CL (5A, large inter-state B2C invoices) ──────────────────────────
    if (section === "b2cl") {
      const rows = await q(`
        SELECT
          b.branch_name AS branch, s.invoice_no,
          TO_CHAR(s.invoice_date,'DD/MM/YYYY') AS invoice_date,
          ${INV_VALUE} AS invoice_value, ${EFF_POS} AS place_of_supply,
          COALESCE(s.igst_percent,0) AS rate, COALESCE(s.subtotal_amount,0) AS taxable_value
        ${INVOICE_BASE} AND ${EFF_CATEGORY} = 'B2CL'
        ORDER BY s.invoice_date ASC, s.invoice_no ASC
      `);
      return commonService.okResponse(res, {
        section: "b2cl",
        summary: {
          no_of_invoice: rows.length,
          total_invoice_value: round2(sum(rows, "invoice_value")),
          total_taxable_value: round2(sum(rows, "taxable_value")),
          total_cess: 0,
        },
        data: rows.map((r) => ({
          branch: r.branch || null,
          invoice_no: r.invoice_no,
          invoice_date: r.invoice_date,
          invoice_value: round2(r.invoice_value),
          place_of_supply: r.place_of_supply || null,
          applicable_tax_rate: null,
          rate: round2(r.rate),
          taxable_value: round2(r.taxable_value),
          cess_amount: 0,
          ecommerce_gstin: null,
        })),
      });
    }

    // ── B2CS (7, small/intra-state B2C, rate-wise summary) ─────────────────
    if (section === "b2cs") {
      const rows = await q(`
        SELECT
          b.branch_name AS branch, ${EFF_POS} AS place_of_supply, ${GST_RATE} AS rate,
          COALESCE(SUM(s.subtotal_amount),0) AS taxable_value
        ${INVOICE_BASE} AND ${EFF_CATEGORY} = 'B2CS'
        GROUP BY b.branch_name, ${EFF_POS}, ${GST_RATE}
        ORDER BY ${EFF_POS}
      `);
      return commonService.okResponse(res, {
        section: "b2cs",
        summary: {
          total_taxable_value: round2(sum(rows, "taxable_value")),
          total_cess: 0,
        },
        data: rows.map((r) => ({
          branch: r.branch || null,
          type: "OE",
          place_of_supply: r.place_of_supply || null,
          applicable_tax_rate: null,
          rate: round2(r.rate),
          taxable_value: round2(r.taxable_value),
          cess_amount: 0,
          ecommerce_gstin: null,
        })),
      });
    }

    // ── CDNR (9B, credit notes to registered) ──────────────────────────────
    if (section === "cdnr") {
      const rows = await q(`
        SELECT
          ${RET_GSTIN} AS gstin, c.customer_name AS receiver_name,
          r.sales_return_no AS note_number,
          TO_CHAR(r.return_date,'DD/MM/YYYY') AS note_date,
          ${RET_POS} AS place_of_supply, ${RET_RATE} AS rate,
          COALESCE(r.subtotal_amount,0) AS taxable_value,
          COALESCE(r.total_amount,0) AS note_value,
          ri.orig_invoice_no AS original_invoice_no, b.branch_name AS branch
        ${RETURN_BASE} AND ${RET_GSTIN} IS NOT NULL
        ORDER BY r.return_date ASC, r.sales_return_no ASC
      `);
      const gstins = new Set(rows.map((r) => r.gstin).filter(Boolean));
      return commonService.okResponse(res, {
        section: "cdnr",
        summary: {
          no_of_receipts: gstins.size,
          no_of_notes: rows.length,
          total_note_value: round2(sum(rows, "note_value")),
          total_taxable_amount: round2(sum(rows, "taxable_value")),
          total_cess: 0,
        },
        data: rows.map((r) => ({
          gstin: r.gstin || null,
          receiver_name: r.receiver_name,
          note_number: r.note_number,
          note_date: r.note_date,
          note_type: "C",
          place_of_supply: r.place_of_supply || null,
          reverse_charge: "N",
          // Registered GSTIN -> the note reduces a B2B supply, else a B2CS supply.
          note_supply_type: r.gstin ? "B2B" : "B2CS",
          applicable_tax_rate: null,
          rate: round2(r.rate),
          taxable_value: round2(r.taxable_value),
          cess_amount: 0,
          note_value: round2(r.note_value),
          original_invoice_no: r.original_invoice_no || null,
          branch: r.branch || null,
        })),
      });
    }

    // ── CDNUR (9B, credit notes to unregistered) ───────────────────────────
    if (section === "cdnur") {
      const rows = await q(`
        SELECT
          r.sales_return_no AS note_number,
          TO_CHAR(r.return_date,'DD/MM/YYYY') AS note_date,
          ${RET_POS} AS place_of_supply, ${RET_RATE} AS rate,
          COALESCE(r.subtotal_amount,0) AS taxable_value,
          COALESCE(r.total_amount,0) AS note_value,
          'B2CL' AS ur_type,
          ri.orig_invoice_no AS original_invoice_no, b.branch_name AS branch
        -- CDNUR only carries inter-state (B2CL) & export credit notes; the GSTR-1
        -- schema has no 'B2CS' UR type. Intra-state B2C credit notes are netted
        -- into B2CS at filing time and are intentionally not listed here.
        ${RETURN_BASE} AND ${RET_GSTIN} IS NULL AND COALESCE(r.igst_amount,0) > 0
        ORDER BY r.return_date ASC, r.sales_return_no ASC
      `);
      return commonService.okResponse(res, {
        section: "cdnur",
        summary: {
          no_of_notes: rows.length,
          total_note_value: round2(sum(rows, "note_value")),
          total_taxable_amount: round2(sum(rows, "taxable_value")),
          total_cess: 0,
        },
        data: rows.map((r) => ({
          ur_type: r.ur_type,
          note_number: r.note_number,
          note_date: r.note_date,
          note_type: "C",
          place_of_supply: r.place_of_supply || null,
          note_value: round2(r.note_value),
          applicable_tax_rate: null,
          rate: round2(r.rate),
          taxable_value: round2(r.taxable_value),
          cess_amount: 0,
          original_invoice_no: r.original_invoice_no || null,
          branch: r.branch || null,
        })),
      });
    }

    // ── EXP (6A, exports) ──────────────────────────────────────────────────
    if (section === "exp") {
      const rows = await q(`
        SELECT
          b.branch_name AS branch, s.export_type, s.invoice_no AS invoice_number,
          TO_CHAR(s.invoice_date,'DD/MM/YYYY') AS invoice_date,
          ${INV_VALUE} AS invoice_value,
          ${GST_RATE} AS rate, COALESCE(s.subtotal_amount,0) AS taxable_value
        ${INVOICE_BASE} AND ${EFF_CATEGORY} = 'EXP'
        ORDER BY s.invoice_date ASC, s.invoice_no ASC
      `);
      return commonService.okResponse(res, {
        section: "exp",
        summary: {
          no_of_invoices: rows.length,
          total_invoice_value: round2(sum(rows, "invoice_value")),
          total_taxable_value: round2(sum(rows, "taxable_value")),
          no_of_shipping_bill: 0,
        },
        data: rows.map((r) => ({
          branch: r.branch || null,
          // GST export-type codes: WPAY (with payment of IGST) / WOPAY (under LUT).
          export_type:
            r.export_type === "With Payment"
              ? "WPAY"
              : r.export_type === "Without Payment"
              ? "WOPAY"
              : r.export_type || null,
          invoice_number: r.invoice_number,
          invoice_date: r.invoice_date,
          invoice_value: round2(r.invoice_value),
          // No port/shipping-bill columns captured at billing yet — left null.
          port_code: null,
          shipping_bill_number: null,
          shipping_bill_date: null,
          rate: round2(r.rate),
          taxable_value: round2(r.taxable_value),
        })),
      });
    }

    // ── AT (11A, advances received in the period, by place of supply) ──────
    if (section === "at") {
      const rows = await q(`
        SELECT b.branch_name AS branch, ${ADV_POS} AS place_of_supply,
               COALESCE(SUM(vr.amount),0) AS gross_advance_received
        ${ADV_BASE}
        GROUP BY b.branch_name, ${ADV_POS}
        ORDER BY ${ADV_POS}
      `);
      return commonService.okResponse(res, {
        section: "at",
        summary: {
          total_advance_received: round2(sum(rows, "gross_advance_received")),
          total_cess: 0,
        },
        data: rows.map((r) => ({
          branch: r.branch || null,
          place_of_supply: r.place_of_supply || null,
          applicable_tax_rate: null,
          rate: null,
          gross_advance_received: round2(r.gross_advance_received),
          cess_amount: 0,
        })),
      });
    }

    // ── ATADJ (11B, advances adjusted against invoices IN this period) ─────
    // Attributed by the CONSUMING invoice's date (period-correct), derived from
    // the Advance-mode payment rows the invoice booked against a prior advance —
    // not by the advance's own receipt_date, which would report it in the wrong
    // period and shift retroactively as the mutable is_advance_used flag flips.
    if (section === "atadj") {
      const rows = await q(`
        SELECT b.branch_name AS branch, ${EFF_POS} AS place_of_supply,
               COALESCE(SUM(p.amount_received),0) AS gross_advance_adjusted
        FROM payments p
        JOIN sales_invoice_bills s ON s.id = p.invoice_bill_id
          AND s.deleted_at IS NULL AND s.status = 'Invoice'
        LEFT JOIN customers c   ON c.id = s.customer_id
        LEFT JOIN branches  b   ON b.id = s.branch_id
        LEFT JOIN states    cst ON cst.id = c.state_id
        LEFT JOIN states    bst ON bst.id = b.state_id
        WHERE p.deleted_at IS NULL AND p.status = 'Completed'
          AND p.payment_mode = 'Advance'
          AND (:branch_id IS NULL OR s.branch_id = :branch_id)
          AND s.invoice_date BETWEEN :from_date AND :to_date
        GROUP BY b.branch_name, ${EFF_POS}
        ORDER BY ${EFF_POS}
      `);
      return commonService.okResponse(res, {
        section: "atadj",
        summary: {
          total_advance_adjusted: round2(sum(rows, "gross_advance_adjusted")),
          total_cess: 0,
        },
        data: rows.map((r) => ({
          branch: r.branch || null,
          place_of_supply: r.place_of_supply || null,
          applicable_tax_rate: null,
          rate: null,
          gross_advance_adjusted: round2(r.gross_advance_adjusted),
          cess_amount: 0,
        })),
      });
    }

    // ── EXEMP (8, nil rated / exempt / non-GST outward supplies) ───────────
    if (section === "exemp") {
      // Exempt/nil/non-GST supplies carry NO tax, so igst_amount is always 0 and
      // cannot signal inter-state. Compare place-of-supply state vs branch state.
      const SCOPE = `CASE WHEN COALESCE(s.place_of_supply_code, cst.state_code) IS DISTINCT FROM bst.state_code THEN 'inter' ELSE 'intra' END`;
      const rows = await q(`
        SELECT
          CASE WHEN ${EFF_GSTIN} IS NOT NULL THEN 'registered' ELSE 'unregistered' END AS reg,
          ${SCOPE} AS scope,
          COALESCE(s.supply_type,'Taxable') AS supply_type,
          COALESCE(SUM(s.subtotal_amount),0) AS taxable_value
        ${INVOICE_BASE} AND COALESCE(s.supply_type,'Taxable') <> 'Taxable'
        GROUP BY
          CASE WHEN ${EFF_GSTIN} IS NOT NULL THEN 'registered' ELSE 'unregistered' END,
          ${SCOPE},
          COALESCE(s.supply_type,'Taxable')
      `);

      const buckets = [
        { key: "inter|registered", description: "Inter-State supplies to registered persons" },
        { key: "intra|registered", description: "Intra-State supplies to registered persons" },
        { key: "inter|unregistered", description: "Inter-State supplies to unregistered persons" },
        { key: "intra|unregistered", description: "Intra-State supplies to unregistered persons" },
      ];
      const acc = {};
      for (const bkt of buckets) acc[bkt.key] = { nil: 0, exempt: 0, non_gst: 0 };
      for (const r of rows) {
        const k = `${r.scope}|${r.reg}`;
        if (!acc[k]) continue;
        const v = parseFloat(r.taxable_value || 0);
        if (r.supply_type === "Nil Rated") acc[k].nil += v;
        else if (r.supply_type === "Exempt") acc[k].exempt += v;
        else if (r.supply_type === "Non GST") acc[k].non_gst += v;
      }
      const data = buckets.map((bkt) => ({
        description: bkt.description,
        nil_rated_supplies: round2(acc[bkt.key].nil),
        exempted_supplies: round2(acc[bkt.key].exempt),
        non_gst_supplies: round2(acc[bkt.key].non_gst),
      }));
      return commonService.okResponse(res, {
        section: "exemp",
        summary: {
          total_nil_rated_supplies: round2(data.reduce((a, d) => a + d.nil_rated_supplies, 0)),
          total_exempted_supplies: round2(data.reduce((a, d) => a + d.exempted_supplies, 0)),
          total_non_gst_supplies: round2(data.reduce((a, d) => a + d.non_gst_supplies, 0)),
        },
        data,
      });
    }

    // ── HSN summaries (12) & Item Summary — shared builder ──────────────────
    // hsn_b2b: B2B invoices; hsn_b2c: B2C (B2CS/B2CL); item_summary: all.
    if (section === "hsn_b2b" || section === "hsn_b2c" || section === "item_summary") {
      const categoryFilter =
        section === "hsn_b2b"
          ? `AND ${EFF_CATEGORY} = 'B2B'`
          : section === "hsn_b2c"
          ? `AND ${EFF_CATEGORY} <> 'B2B'`
          : "";

      // Prorate header-level tax/subtotal across items by each item's share of
      // the invoice line total (net_total = Σ item amounts).
      const rows = await q(`
        SELECT
          b.branch_name AS branch, si.hsn_code AS hsn, ${GST_RATE} AS rate,
          MAX(si.product_name_snapshot) AS description,
          -- Jewellery is reported in grams (UQC = GMS); quantity is total weight.
          SUM(COALESCE(si.gross_weight,0)) AS total_quantity,
          SUM(CASE WHEN COALESCE(s.net_total, 0) > 0
                THEN COALESCE(si.amount, 0) / s.net_total * COALESCE(s.total_amount, 0)
              ELSE 0
            END) AS total_value,
          SUM(CASE WHEN COALESCE(s.net_total,0) > 0
                THEN si.amount / s.net_total * COALESCE(s.subtotal_amount,0)
                ELSE si.amount END) AS taxable_value,
          SUM(CASE WHEN COALESCE(s.net_total,0) > 0
                THEN si.amount / s.net_total * COALESCE(s.igst_amount,0) ELSE 0 END) AS integrated_tax_amount,
          SUM(CASE WHEN COALESCE(s.net_total,0) > 0
                THEN si.amount / s.net_total * COALESCE(s.cgst_amount,0) ELSE 0 END) AS central_tax_amount,
          SUM(CASE WHEN COALESCE(s.net_total,0) > 0
                THEN si.amount / s.net_total * COALESCE(s.sgst_amount,0) ELSE 0 END) AS state_ut_tax_amount
        FROM sales_invoice_bill_items si
        JOIN sales_invoice_bills s ON s.id = si.invoice_bill_id
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN branches  b ON b.id = s.branch_id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL
          AND s.status = 'Invoice'
          AND (:branch_id IS NULL OR s.branch_id = :branch_id)
          AND s.invoice_date BETWEEN :from_date AND :to_date
          AND si.hsn_code IS NOT NULL AND si.hsn_code <> ''
          ${categoryFilter}
        GROUP BY b.branch_name, si.hsn_code, ${GST_RATE}
        ORDER BY si.hsn_code
      `);

      const data = rows.map((r) => {
        const taxable = parseFloat(r.taxable_value || 0);
        const igst = parseFloat(r.integrated_tax_amount || 0);
        const cgst = parseFloat(r.central_tax_amount || 0);
        const sgst = parseFloat(r.state_ut_tax_amount || 0);
        const totalValue = parseFloat(r.total_value || 0);
        return {
          branch: r.branch || null,
          hsn: r.hsn,
          description: r.description || null,
          uqc: "GMS",
          total_quantity: parseFloat(parseFloat(r.total_quantity || 0).toFixed(3)),
          total_value: round2(totalValue),
          rate: round2(r.rate),
          taxable_value: round2(taxable),
          integrated_tax_amount: round2(igst),
          central_tax_amount: round2(cgst),
          state_ut_tax_amount: round2(sgst),
          cess_amount: 0,
        };
      });
      const hsnSet = new Set(data.map((d) => d.hsn));
      return commonService.okResponse(res, {
        section,
        summary: {
          no_of_hsn: hsnSet.size,
          total_values: round2(data.reduce((a, d) => a + d.total_value, 0)),
          total_taxable_value: round2(data.reduce((a, d) => a + d.taxable_value, 0)),
          total_integrated_tax: round2(data.reduce((a, d) => a + d.integrated_tax_amount, 0)),
          total_central_tax: round2(data.reduce((a, d) => a + d.central_tax_amount, 0)),
          total_state_ut_tax: round2(data.reduce((a, d) => a + d.state_ut_tax_amount, 0)),
          total_cess: 0,
        },
        data,
      });
    }

    // ── Docs (13, summary of documents issued in the period) ───────────────
    if (section === "docs") {
      const [invoiceDocs, creditDocs] = await Promise.all([
        q(`
          SELECT
            b.branch_name AS branch,
            'Invoices for outward supply' AS nature_of_document,
            MIN(s.invoice_no) AS sr_no_from, MAX(s.invoice_no) AS sr_no_to,
            COUNT(*) AS total_number,
            COUNT(*) FILTER (WHERE s.status = 'Cancelled') AS cancelled
          FROM sales_invoice_bills s
          LEFT JOIN branches b ON b.id = s.branch_id
          WHERE s.deleted_at IS NULL
            AND s.status IN ('Invoice','Printed','Cancelled')
            AND (:branch_id IS NULL OR s.branch_id = :branch_id)
            AND s.invoice_date BETWEEN :from_date AND :to_date
          GROUP BY b.branch_name
        `),
        q(`
          SELECT
            b.branch_name AS branch,
            'Credit Note' AS nature_of_document,
            MIN(r.sales_return_no) AS sr_no_from, MAX(r.sales_return_no) AS sr_no_to,
            COUNT(*) AS total_number,
            COUNT(*) FILTER (WHERE r.status = 'Cancelled') AS cancelled
          FROM sales_returns r
          LEFT JOIN branches b ON b.id = r.branch_id
          WHERE r.deleted_at IS NULL
            AND r.is_active = true
            AND r.status IN ('Printed','Cancelled')
            AND (:branch_id IS NULL OR r.branch_id = :branch_id)
            AND r.return_date BETWEEN :from_date AND :to_date
          GROUP BY b.branch_name
        `),
      ]);

      const allDocs = [...invoiceDocs, ...creditDocs];
      return commonService.okResponse(res, {
        section: "docs",
        summary: {
          total_number: allDocs.reduce((a, r) => a + parseInt(r.total_number || 0), 0),
          total_cancelled: allDocs.reduce((a, r) => a + parseInt(r.cancelled || 0), 0),
        },
        data: allDocs.map((r) => ({
          branch: r.branch || null,
          nature_of_document: r.nature_of_document,
          sr_no_from: r.sr_no_from || null,
          sr_no_to: r.sr_no_to || null,
          total_number: parseInt(r.total_number || 0),
          cancelled: parseInt(r.cancelled || 0),
        })),
      });
    }

    // Unknown section fallback
    return commonService.okResponse(res, { section, summary: {}, data: [] });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  getTrialBalance,
  getProfitLoss,
  getBalanceSheet,
  getGstr1,
  getGstr1Portal,
  // Shared with reportService's ledger statement so the drill-down is built from
  // the trial balance's own postings instead of a second, drifting copy.
  buildLedgerStatementSql,
};
