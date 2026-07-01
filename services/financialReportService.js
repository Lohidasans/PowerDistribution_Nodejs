const { sequelize } = require("../models");
const commonService = require("./commonService");

// Shared CTE: aggregates all transaction sources by ledger_id for a date range
const ALL_TXNS_CTE = `
  WITH all_txns AS (

    /* =========================================================
       A) SALES INVOICE  (status = 'Invoice')
       Cr: Silver Sales (subtotal) + Output CGST/SGST/IGST
       Dr: payment-mode ledgers + adjustment ledgers + customer receivable
       Balance: subtotal+cgst+sgst+igst = Σpay(5 modes) + Σadj(1,2,3) + receivable
       ALL legs keyed off the INVOICE (s.invoice_date + s.branch_id) so an
       invoice's Dr and Cr always enter/leave the report window together.
       ========================================================= */

    -- A.Cr1  Silver Sales = subtotal_amount
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Silver Sales' AND g.ledger_group_name = 'Sales Accounts'
        ORDER BY l.id LIMIT 1)                                   AS ledger_id,
      0 AS debit,
      COALESCE(s.subtotal_amount, 0) AS credit
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
      0, COALESCE(s.cgst_amount, 0)
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
      0, COALESCE(s.sgst_amount, 0)
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
      0, COALESCE(s.igst_amount, 0)
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
          AND l.ledger_name = 'Cash in Hand' AND g.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      COALESCE(p.amount_received, 0), 0
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
          AND l.ledger_name = 'UPI Collections' AND g.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      COALESCE(p.amount_received, 0), 0
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
          AND l.ledger_name = 'Card Collections' AND g.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      COALESCE(p.amount_received, 0), 0
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
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Bank Accounts' AND g.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      COALESCE(p.amount_received, 0), 0
    FROM payments p
    JOIN sales_invoice_bills s ON s.id = p.invoice_bill_id
    WHERE p.deleted_at IS NULL AND s.deleted_at IS NULL
      AND p.status = 'Completed' AND s.status = 'Invoice'
      AND p.payment_mode IN ('Bank Transfer', 'Cheque')
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr5  Old Gold Purchase (adjustment_type_id '2' Old Jewel)
    --  FIX: 'Old Gold Purchase' lives under group 'Purchase Accounts'
    --  (the Sales-side leaf is 'Old Gold Sales'), verified in chart seeders.
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Old Gold Purchase' AND g.ledger_group_name = 'Purchase Accounts'
        ORDER BY l.id LIMIT 1),
      COALESCE(a.adjustment_amount, 0), 0
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
      COALESCE(a.adjustment_amount, 0), 0
    FROM sales_invoice_adjustments a
    JOIN sales_invoice_bills s ON s.id = a.sales_invoice_id
    WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.status = 'Invoice' AND a.adjustment_type_id = '3'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr7  Sales Return (adjustment_type_id '1')
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
          AND l.ledger_name = 'Sales Return' AND g.ledger_group_name = 'Sales Accounts'
        ORDER BY l.id LIMIT 1),
      COALESCE(a.adjustment_amount, 0), 0
    FROM sales_invoice_adjustments a
    JOIN sales_invoice_bills s ON s.id = a.sales_invoice_id
    WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.status = 'Invoice' AND a.adjustment_type_id = '1'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- A.Dr8  Customer receivable (Sundry Debtors leaf) = UNPAID remainder
    --  = (subtotal+cgst+sgst+igst) - Σ(cash-like payments) - Σ(type 1/2/3 adjustments)
    --  FIX 1: pay.paid restricted to the SAME 5 cash-like modes booked in A.Dr1..4
    --         so Advance/Other payments do NOT silently reduce the receivable and
    --         unbalance the entry (their offsetting Dr belongs to the advance receipt,
    --         out of scope here). Result: Dr(A) = subtotal+gst exactly.
    --  FIX 2: adj.adjusted restricted to types ('1','2','3') so it can never diverge
    --         from the booked adjustment debit legs (A.Dr5/6/7).
    --  Computed live from payments/adjustments (NOT stored amount_due) so it stays
    --  correct if a payment is added after invoice creation.
    SELECT
      lc.id,
      (   COALESCE(s.subtotal_amount,0)
        + COALESCE(s.cgst_amount,0) + COALESCE(s.sgst_amount,0) + COALESCE(s.igst_amount,0)
        - COALESCE(pay.paid, 0)
        - COALESCE(adj.adjusted, 0)
      ) AS debit,
      0
    FROM sales_invoice_bills s
    JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
    JOIN ledger lc ON lc.id = c.ledger_id AND lc.deleted_at IS NULL
    LEFT JOIN (
      SELECT p.invoice_bill_id, SUM(COALESCE(p.amount_received,0)) AS paid
      FROM payments p
      WHERE p.deleted_at IS NULL AND p.status = 'Completed'
        AND p.invoice_bill_id IS NOT NULL
        AND p.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      GROUP BY p.invoice_bill_id
    ) pay ON pay.invoice_bill_id = s.id
    LEFT JOIN (
      SELECT a.sales_invoice_id, SUM(COALESCE(a.adjustment_amount,0)) AS adjusted
      FROM sales_invoice_adjustments a
      WHERE a.deleted_at IS NULL
        AND a.adjustment_type_id IN ('1','2','3')
      GROUP BY a.sales_invoice_id
    ) adj ON adj.sales_invoice_id = s.id
    WHERE s.deleted_at IS NULL AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       B) GRN  (purchase)
       Cr: Vendor (Sundry Creditors) = grns.total_amount
       Dr: Silver Purchase + Stone(+others) + Karigar + GST Input CGST/SGST + plug
       total_amount = subtotal + subtotal*cgst_percent/100 + subtotal*sgst_percent/100
                      + discount_percent(signed round-off, ADDED)
       subtotal     = SUM(grnItems.total_amount) = SUM(net*rate + stone_wt*stone_rate
                      + making + others_value)
       GRN has NO igst; inter-state GST is carried in sgst_percent with cgst_percent=0.
       Plug (B.Dr6) absorbs the signed round-off AND any 4dp->2dp rounding drift so
       Dr = Cr(total_amount) to the cent for every GRN.
       ========================================================= */

    -- B.Cr  Vendor (Sundry Creditors) = total_amount
    SELECT lv.id, 0, COALESCE(g.total_amount, 0)
    FROM grns g
    JOIN vendors v ON v.id = g.vendor_id AND v.deleted_at IS NULL
    JOIN ledger lv ON lv.id = v.ledger_id AND lv.deleted_at IS NULL
    WHERE g.deleted_at IS NULL
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr1  Silver Purchase = SUM(net_wt_in_g * purchase_rate)
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'Silver Purchase' AND grp.ledger_group_name = 'Purchase Accounts'
        ORDER BY l.id LIMIT 1),
      COALESCE(gi.silver, 0), 0
    FROM grns g
    JOIN (
      SELECT grn_id, SUM(COALESCE(net_wt_in_g,0) * COALESCE(purchase_rate,0)) AS silver
      FROM "grnItems" WHERE deleted_at IS NULL GROUP BY grn_id
    ) gi ON gi.grn_id = g.id
    WHERE g.deleted_at IS NULL
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr2  Stone Purchase Cost = SUM(stone_wt_in_g*stone_rate) + SUM(others_value)
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'Stone Purchase Cost' AND grp.ledger_group_name = 'Direct Expenses'
        ORDER BY l.id LIMIT 1),
      COALESCE(gi.stone, 0), 0
    FROM grns g
    JOIN (
      SELECT grn_id,
             SUM(COALESCE(stone_wt_in_g,0) * COALESCE(stone_rate,0)
                 + COALESCE(others_value,0)) AS stone
      FROM "grnItems" WHERE deleted_at IS NULL GROUP BY grn_id
    ) gi ON gi.grn_id = g.id
    WHERE g.deleted_at IS NULL
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr3  Karigar Charges = SUM(making_charge)
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'Karigar Charges' AND grp.ledger_group_name = 'Direct Expenses'
        ORDER BY l.id LIMIT 1),
      COALESCE(gi.karigar, 0), 0
    FROM grns g
    JOIN (
      SELECT grn_id, SUM(COALESCE(making_charge,0)) AS karigar
      FROM "grnItems" WHERE deleted_at IS NULL GROUP BY grn_id
    ) gi ON gi.grn_id = g.id
    WHERE g.deleted_at IS NULL
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr4  GST Input CGST = subtotal_amount * cgst_percent / 100
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'GST Input CGST' AND grp.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.cgst_percent,0) / 100.0, 2), 0
    FROM grns g
    WHERE g.deleted_at IS NULL
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr5  GST Input SGST = subtotal_amount * sgst_percent / 100
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'GST Input SGST' AND grp.ledger_group_name = 'Current Assets'
        ORDER BY l.id LIMIT 1),
      ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.sgst_percent,0) / 100.0, 2), 0
    FROM grns g
    WHERE g.deleted_at IS NULL
      AND (:branch_id IS NULL OR g.branch_id = :branch_id)
      AND g.grn_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- B.Dr6  GRN round-off / reconcile plug
    --  FIX: routed to an EXISTING leaf 'Discount Received' under 'Indirect Income'
    --  (there is NO 'Round Off' leaf in the chart — the old target resolved NULL and
    --  was silently dropped, unbalancing every rounded GRN). A GRN round-off that
    --  reduces the payable is a purchase discount (income); the signed value also
    --  absorbs subtotal-vs-component 2dp drift, guaranteeing Dr = Cr per GRN.
    --  NOTE: this is a DEBIT to an income leaf, so it typically carries a small
    --  (often negative) balance — acceptable as the reconciling plug. Owner may
    --  instead create a dedicated 'Round Off' leaf (see DECISIONS) and repoint here.
    SELECT
      (SELECT l.id FROM ledger l JOIN ledger_group grp ON grp.id = l.ledger_group_id
        WHERE l.deleted_at IS NULL AND grp.deleted_at IS NULL
          AND l.ledger_name = 'Discount Received' AND grp.ledger_group_name = 'Indirect Income'
        ORDER BY l.id LIMIT 1),
      (   COALESCE(g.total_amount,0)
        - COALESCE(comp.components, 0)
        - ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.cgst_percent,0) / 100.0, 2)
        - ROUND(COALESCE(g.subtotal_amount,0) * COALESCE(g.sgst_percent,0) / 100.0, 2)
      ) AS debit,
      0
    FROM grns g
    LEFT JOIN (
      SELECT grn_id,
             SUM(COALESCE(net_wt_in_g,0)*COALESCE(purchase_rate,0)
                 + COALESCE(stone_wt_in_g,0)*COALESCE(stone_rate,0)
                 + COALESCE(making_charge,0)
                 + COALESCE(others_value,0)) AS components
      FROM "grnItems" WHERE deleted_at IS NULL GROUP BY grn_id
    ) comp ON comp.grn_id = g.id
    WHERE g.deleted_at IS NULL
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
              AND l.ledger_name = 'Cash in Hand' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode = 'UPI' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode = 'Card' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN p.payment_mode IN ('Bank Transfer','Cheque') THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Bank Accounts' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
      END AS ledger_id,
      COALESCE(p.amount_received, 0), 0
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
      0, COALESCE(p.amount_received, 0)
    FROM payments p
    JOIN customer_scheme_payments csp ON csp.id = p.scheme_payment_id AND csp.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND p.status = 'Completed'
      AND p.scheme_payment_id IS NOT NULL
      AND p.payment_mode IN ('Cash','UPI','Card','Bank Transfer','Cheque')
      AND (:branch_id IS NULL OR csp.branch_id = :branch_id)
      AND p.payment_date::date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       D) VENDOR PAYMENT  (money out to vendor)
       Dr vendor (Sundry Creditors) = vp.amount ; Cr payment-mode ledger.
       FIX 1: D.Dr restricted to the SAME set of mapped modes (1..5) as D.Cr, so a
              mode 6 ('Other') payment cannot produce a Dr with no matching Cr.
       FIX 2: branch filter via vp.branch_id on both legs.
       ========================================================= */

    -- D.Dr  Vendor (Sundry Creditors)
    SELECT lv.id, COALESCE(vp.amount, 0), 0
    FROM vendor_payments vp
    JOIN vendors v ON v.id = vp.account_name_id AND v.deleted_at IS NULL
    JOIN ledger lv ON lv.id = v.ledger_id AND lv.deleted_at IS NULL
    JOIN payment_modes pm ON pm.id = vp.payment_mode
    WHERE vp.deleted_at IS NULL AND vp.status = 'Completed'
      AND vp.user_type_id = 1
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
              AND l.ledger_name = 'Cash in Hand' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode = 'UPI' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode = 'Card' THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN pm.payment_mode IN ('Bank Transfer','Cheque') THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Bank Accounts' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
      END AS ledger_id,
      0, COALESCE(vp.amount, 0)
    FROM vendor_payments vp
    JOIN payment_modes pm ON pm.id = vp.payment_mode
    WHERE vp.deleted_at IS NULL AND vp.status = 'Completed'
      AND vp.user_type_id = 1
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
              AND l.ledger_name = 'Cash in Hand' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN r.payment_mode_id = 5 THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'UPI Collections' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN r.payment_mode_id = 2 THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Card Collections' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
        WHEN r.payment_mode_id IN (3,4) THEN
          (SELECT l.id FROM ledger l JOIN ledger_group g ON g.id = l.ledger_group_id
            WHERE l.deleted_at IS NULL AND g.deleted_at IS NULL
              AND l.ledger_name = 'Bank Accounts' AND g.ledger_group_name = 'Current Assets'
            ORDER BY l.id LIMIT 1)
      END AS ledger_id,
      COALESCE(r.amount, 0), 0
    FROM voucher_receipts r
    WHERE r.deleted_at IS NULL
      AND r.bill_type_id IN (2, 3)
      AND r.payment_mode_id IN (1,2,3,4,5)
      AND (:branch_id IS NULL OR r.branch_id = :branch_id)
      AND r.receipt_date BETWEEN :from_date AND :to_date

    UNION ALL

    -- V.Cr  account_id ledger for manual receipt vouchers (non-scheme)
    --  account_id is a ledger id for bill_type 2/3 (verified in voucherReceiptService).
    SELECT lc.id, 0, COALESCE(r.amount, 0)
    FROM voucher_receipts r
    JOIN ledger lc ON lc.id = r.account_id AND lc.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.bill_type_id IN (2, 3)
      AND r.payment_mode_id IN (1,2,3,4,5)
      AND (:branch_id IS NULL OR r.branch_id = :branch_id)
      AND r.receipt_date BETWEEN :from_date AND :to_date

    UNION ALL

    /* =========================================================
       E) JOURNAL ENTRIES — kept as-is
       ========================================================= */
    SELECT jei.account_id, COALESCE(jei.debit, 0), COALESCE(jei.credit, 0)
    FROM journal_entry_items jei
    JOIN journal_entries je ON je.id = jei.journal_entry_id
    WHERE jei.deleted_at IS NULL AND je.deleted_at IS NULL
      AND (:branch_id IS NULL OR je.branch_id = :branch_id)
      AND je.date BETWEEN :from_date AND :to_date
  )
`;

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

    const rows = await fetchLedgerAggregates(branchId, fromDate, toDate, search || null);

    // Collapse flat ledger rows into groups, computing each ledger's net balance.
    const groupMap = new Map();
    for (const row of rows) {
      const net = parseFloat(row.total_debit || 0) - parseFloat(row.total_credit || 0);
      if (!includeZero && net === 0) continue;

      if (!groupMap.has(row.group_id)) {
        groupMap.set(row.group_id, {
          id: row.group_id,
          particulars: row.group_name,
          account_type: row.account_type,
          normal_balance: row.normal_balance,
          net: 0,
          children: [],
        });
      }

      const g = groupMap.get(row.group_id);
      g.net += net;
      g.children.push({
        id: row.ledger_id,
        particulars: row.ledger_name,
        debit: net > 0 ? round2(net) : null,
        credit: net < 0 ? round2(-net) : null,
      });
    }

    let totalDebit = 0;
    let totalCredit = 0;

    const data = Array.from(groupMap.values())
      .filter((g) => includeZero || g.children.length > 0)
      .sort(
        (a, b) =>
          (NATURE_ORDER[a.account_type] || 9) - (NATURE_ORDER[b.account_type] || 9) ||
          a.particulars.localeCompare(b.particulars)
      )
      .map((g) => {
        // Group balance = net of its ledgers, placed on the resulting side.
        const debit = g.net > 0 ? round2(g.net) : null;
        const credit = g.net < 0 ? round2(-g.net) : null;
        totalDebit += debit || 0;
        totalCredit += credit || 0;
        return {
          id: g.id,
          particulars: g.particulars,
          account_type: g.account_type,
          normal_balance: g.normal_balance,
          debit,
          credit,
          children: g.children,
        };
      });

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
// ─────────────────────────────────────────
const getProfitLoss = async (req, res) => {
  try {
    const { branch_id, from_date, to_date } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;

    const rows = await fetchLedgerAggregates(branchId, fromDate, toDate, null);
    const groupMap = buildGroupMap(rows);

    const tradingDebit = [];   // Opening Stock, Purchase, Direct Expenses
    const tradingCredit = [];  // Sales, Direct Incomes, Closing Stock
    const pnlDebit = [];       // Indirect Expenses
    const pnlCredit = [];      // Indirect Income

    for (const g of groupMap.values()) {
      const name = (g.group_name || "").toLowerCase();
      const net = g.group_debit - g.group_credit;
      const entry = {
        particulars: g.group_name,
        amount: Math.abs(net).toFixed(2),
        children: g.ledgers.map((l) => ({
          particulars: l.ledger_name,
          debit: l.debit,
          credit: l.credit,
        })),
      };

      if (g.account_type === "Expense") {
        if (name.includes("indirect")) {
          pnlDebit.push(entry);
        } else {
          tradingDebit.push(entry);
        }
      } else if (g.account_type === "Income") {
        if (name.includes("indirect")) {
          pnlCredit.push(entry);
        } else {
          tradingCredit.push(entry);
        }
      }
    }

    const tradingDebitTotal = tradingDebit.reduce((s, e) => s + parseFloat(e.amount), 0);
    const tradingCreditTotal = tradingCredit.reduce((s, e) => s + parseFloat(e.amount), 0);
    const pnlDebitTotal = pnlDebit.reduce((s, e) => s + parseFloat(e.amount), 0);
    const pnlCreditTotal = pnlCredit.reduce((s, e) => s + parseFloat(e.amount), 0);

    // Gross Profit / Loss plugged into the second section
    const grossProfit = tradingCreditTotal - tradingDebitTotal;
    const netProfit = grossProfit + pnlCreditTotal - pnlDebitTotal;

    return commonService.okResponse(res, {
      trading_account: {
        debit: tradingDebit,
        debit_total: tradingDebitTotal.toFixed(2),
        credit: tradingCredit,
        credit_total: tradingCreditTotal.toFixed(2),
        gross_profit: grossProfit.toFixed(2),
      },
      pnl_account: {
        debit: pnlDebit,
        debit_total: pnlDebitTotal.toFixed(2),
        credit: pnlCredit,
        credit_total: pnlCreditTotal.toFixed(2),
        net_profit: netProfit.toFixed(2),
      },
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// ─────────────────────────────────────────
// BALANCE SHEET
// ─────────────────────────────────────────
const getBalanceSheet = async (req, res) => {
  try {
    const { branch_id, from_date, to_date } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;

    const rows = await fetchLedgerAggregates(branchId, fromDate, toDate, null);
    const groupMap = buildGroupMap(rows);

    const liabilities = [];
    const assets = [];
    let totalLiabilities = 0;
    let totalAssets = 0;

    for (const g of groupMap.values()) {
      if (g.account_type === "Liability") {
        // Net credit balance for liabilities
        const amount = g.group_credit - g.group_debit;
        const entry = {
          group_id: g.group_id,
          group_name: g.group_name,
          amount: amount.toFixed(2),
          children: g.ledgers.map((l) => ({
            ledger_id: l.ledger_id,
            ledger_name: l.ledger_name,
            amount: (parseFloat(l.credit) - parseFloat(l.debit)).toFixed(2),
          })),
        };
        liabilities.push(entry);
        totalLiabilities += amount;
      } else if (g.account_type === "Asset") {
        // Net debit balance for assets
        const amount = g.group_debit - g.group_credit;
        const entry = {
          group_id: g.group_id,
          group_name: g.group_name,
          amount: amount.toFixed(2),
          children: g.ledgers.map((l) => ({
            ledger_id: l.ledger_id,
            ledger_name: l.ledger_name,
            amount: (parseFloat(l.debit) - parseFloat(l.credit)).toFixed(2),
          })),
        };
        assets.push(entry);
        totalAssets += amount;
      }
    }

    return commonService.okResponse(res, {
      liabilities,
      assets,
      total_liabilities: totalLiabilities.toFixed(2),
      total_assets: totalAssets.toFixed(2),
      grand_total: Math.max(totalLiabilities, totalAssets).toFixed(2),
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// ─────────────────────────────────────────
// GSTR1 — INVOICE VIEW
// ─────────────────────────────────────────
const getGstr1 = async (req, res) => {
  try {
    const { branch_id, from_date, to_date } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;

    // Fetch branch GSTIN and company name
    let gstin = null;
    let legalName = null;
    if (branchId) {
      const branchResult = await sequelize.query(
        `SELECT gst_no, branch_name FROM branches WHERE id = :branch_id AND deleted_at IS NULL LIMIT 1`,
        { replacements: { branch_id: branchId }, type: sequelize.QueryTypes.SELECT }
      );
      if (branchResult.length > 0) {
        gstin = branchResult[0].gst_no;
        legalName = branchResult[0].branch_name;
      }
    }

    const sql = `
      SELECT
        c.gst_no            AS gstin_uin,
        c.customer_name     AS party_name,
        'Sales'             AS transaction_type,
        s.invoice_no,
        TO_CHAR(s.invoice_date, 'DD/MM/YYYY') AS invoice_date,
        COALESCE(s.total_amount, 0)            AS invoice_value,
        COALESCE(s.cgst_amount, 0) + COALESCE(s.sgst_amount, 0) + COALESCE(s.igst_amount, 0) AS tax_amount,
        COALESCE(s.subtotal_amount, 0)         AS taxable_value,
        COALESCE(s.cgst_percent, 0) + COALESCE(s.sgst_percent, 0) + COALESCE(s.igst_percent, 0) AS rate,
        s.cgst_percent,
        s.sgst_percent,
        s.igst_percent,
        s.cgst_amount,
        s.sgst_amount,
        s.igst_amount
      FROM sales_invoice_bills s
      JOIN customers c ON c.id = s.customer_id
      WHERE s.deleted_at IS NULL
        AND s.status = 'Invoice'
        AND (:branch_id IS NULL OR s.branch_id = :branch_id)
        AND s.invoice_date BETWEEN :from_date AND :to_date
      ORDER BY s.invoice_date ASC, s.invoice_no ASC
    `;

    const data = await sequelize.query(sql, {
      replacements: { branch_id: branchId, from_date: fromDate, to_date: toDate },
      type: sequelize.QueryTypes.SELECT,
    });

    const formatted = data.map((row) => ({
      gstin_uin: row.gstin_uin || null,
      party_name: row.party_name,
      transaction_type: row.transaction_type,
      invoice_no: row.invoice_no,
      invoice_date: row.invoice_date,
      invoice_value: parseFloat(row.invoice_value || 0).toFixed(2),
      rate: parseFloat(row.rate || 0).toFixed(2),
      taxable_value: parseFloat(row.taxable_value || 0).toFixed(2),
      tax_amount: parseFloat(row.tax_amount || 0).toFixed(2),
      cgst_percent: parseFloat(row.cgst_percent || 0),
      sgst_percent: parseFloat(row.sgst_percent || 0),
      igst_percent: parseFloat(row.igst_percent || 0),
      cgst_amount: parseFloat(row.cgst_amount || 0).toFixed(2),
      sgst_amount: parseFloat(row.sgst_amount || 0).toFixed(2),
      igst_amount: parseFloat(row.igst_amount || 0).toFixed(2),
      cess_rate: null,
      reverse_charge: null,
    }));

    return commonService.okResponse(res, {
      gstin,
      legal_name: legalName,
      trade_name: legalName,
      aggregate_turnover_prev_fy: null,
      aggregate_turnover_apr_jun: null,
      data: formatted,
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

// ─────────────────────────────────────────
// GSTR1 — PORTAL VIEW (B2B / B2CS / B2CL / HSN)
// ─────────────────────────────────────────
const getGstr1Portal = async (req, res) => {
  try {
    const { branch_id, from_date, to_date, section = "b2b" } = req.query;
    const fromDate = from_date || "2000-01-01";
    const toDate = to_date || new Date().toISOString().split("T")[0];
    const branchId = branch_id ? parseInt(branch_id) : null;

    const BASE_WHERE = `
      s.deleted_at IS NULL
      AND s.status = 'Invoice'
      AND (:branch_id IS NULL OR s.branch_id = :branch_id)
      AND s.invoice_date BETWEEN :from_date AND :to_date
    `;

    const replacements = { branch_id: branchId, from_date: fromDate, to_date: toDate };

    if (section === "b2b") {
      // B2B: customers with valid GSTIN
      const summarySql = `
        SELECT
          COUNT(DISTINCT c.gst_no) AS no_of_receipt,
          COUNT(*)                 AS no_of_invoice,
          SUM(COALESCE(s.total_amount, 0))    AS total_invoice_value,
          SUM(COALESCE(s.subtotal_amount, 0)) AS total_taxable_value,
          0                                   AS total_cess
        FROM sales_invoice_bills s
        JOIN customers c ON c.id = s.customer_id
          AND c.gst_no IS NOT NULL AND c.gst_no != ''
        WHERE ${BASE_WHERE}
      `;

      const dataSql = `
        SELECT
          c.gst_no                AS gstin_uin,
          c.customer_name         AS receiver_name,
          s.invoice_no,
          TO_CHAR(s.invoice_date, 'DD/MM/YYYY') AS invoice_date,
          COALESCE(s.total_amount, 0)            AS invoice_value,
          st.state_name                          AS place_of_supply,
          COALESCE(s.subtotal_amount, 0)         AS taxable_value,
          'Invoice'               AS transaction_type
        FROM sales_invoice_bills s
        JOIN customers c ON c.id = s.customer_id
          AND c.gst_no IS NOT NULL AND c.gst_no != ''
        JOIN branches b ON b.id = s.branch_id
        LEFT JOIN states st ON st.id = b.state_id
        WHERE ${BASE_WHERE}
        ORDER BY s.invoice_date ASC, s.invoice_no ASC
      `;

      const [summaryRows, data] = await Promise.all([
        sequelize.query(summarySql, { replacements, type: sequelize.QueryTypes.SELECT }),
        sequelize.query(dataSql, { replacements, type: sequelize.QueryTypes.SELECT }),
      ]);

      const summary = summaryRows[0] || {};

      return commonService.okResponse(res, {
        section: "b2b",
        summary: {
          no_of_receipt: parseInt(summary.no_of_receipt || 0),
          no_of_invoice: parseInt(summary.no_of_invoice || 0),
          total_invoice_value: parseFloat(summary.total_invoice_value || 0).toFixed(2),
          total_taxable_value: parseFloat(summary.total_taxable_value || 0).toFixed(2),
          total_cess: parseFloat(summary.total_cess || 0).toFixed(2),
        },
        data: data.map((row) => ({
          gstin_uin: row.gstin_uin,
          receiver_name: row.receiver_name,
          invoice_no: row.invoice_no,
          invoice_date: row.invoice_date,
          invoice_value: parseFloat(row.invoice_value || 0).toFixed(2),
          place_of_supply: row.place_of_supply || null,
          taxable_value: parseFloat(row.taxable_value || 0).toFixed(2),
          reverse_charge: null,
          applicable_tax_rate: null,
          transaction_type: row.transaction_type,
          ecommerce_gstin: null,
        })),
      });
    }

    if (section === "b2cs") {
      // B2CS: Unregistered customers, invoice value < 2,50,000
      const dataSql = `
        SELECT
          c.customer_name         AS receiver_name,
          s.invoice_no,
          TO_CHAR(s.invoice_date, 'DD/MM/YYYY') AS invoice_date,
          COALESCE(s.total_amount, 0)            AS invoice_value,
          st.state_name                          AS place_of_supply,
          COALESCE(s.subtotal_amount, 0)         AS taxable_value,
          COALESCE(s.cgst_percent, 0) + COALESCE(s.sgst_percent, 0) + COALESCE(s.igst_percent, 0) AS tax_rate
        FROM sales_invoice_bills s
        JOIN customers c ON c.id = s.customer_id
          AND (c.gst_no IS NULL OR c.gst_no = '')
        JOIN branches b ON b.id = s.branch_id
        LEFT JOIN states st ON st.id = b.state_id
        WHERE ${BASE_WHERE}
          AND COALESCE(s.total_amount, 0) < 250000
        ORDER BY s.invoice_date ASC
      `;

      const data = await sequelize.query(dataSql, { replacements, type: sequelize.QueryTypes.SELECT });

      const totalTaxable = data.reduce((s, r) => s + parseFloat(r.taxable_value || 0), 0);
      const totalInvoice = data.reduce((s, r) => s + parseFloat(r.invoice_value || 0), 0);

      return commonService.okResponse(res, {
        section: "b2cs",
        summary: {
          no_of_invoice: data.length,
          total_invoice_value: totalInvoice.toFixed(2),
          total_taxable_value: totalTaxable.toFixed(2),
        },
        data: data.map((row) => ({
          receiver_name: row.receiver_name,
          invoice_no: row.invoice_no,
          invoice_date: row.invoice_date,
          invoice_value: parseFloat(row.invoice_value || 0).toFixed(2),
          place_of_supply: row.place_of_supply || null,
          taxable_value: parseFloat(row.taxable_value || 0).toFixed(2),
          tax_rate: parseFloat(row.tax_rate || 0).toFixed(3),
        })),
      });
    }

    if (section === "b2cl") {
      // B2CL: Unregistered customers, invoice value >= 2,50,000 (inter-state)
      const dataSql = `
        SELECT
          c.customer_name         AS receiver_name,
          s.invoice_no,
          TO_CHAR(s.invoice_date, 'DD/MM/YYYY') AS invoice_date,
          COALESCE(s.total_amount, 0)            AS invoice_value,
          st.state_name                          AS place_of_supply,
          COALESCE(s.subtotal_amount, 0)         AS taxable_value,
          COALESCE(s.igst_percent, 0)            AS tax_rate,
          COALESCE(s.igst_amount, 0)             AS igst_amount
        FROM sales_invoice_bills s
        JOIN customers c ON c.id = s.customer_id
          AND (c.gst_no IS NULL OR c.gst_no = '')
        JOIN branches b ON b.id = s.branch_id
        LEFT JOIN states st ON st.id = b.state_id
        WHERE ${BASE_WHERE}
          AND COALESCE(s.total_amount, 0) >= 250000
        ORDER BY s.invoice_date ASC
      `;

      const data = await sequelize.query(dataSql, { replacements, type: sequelize.QueryTypes.SELECT });

      return commonService.okResponse(res, {
        section: "b2cl",
        summary: {
          no_of_invoice: data.length,
          total_invoice_value: data.reduce((s, r) => s + parseFloat(r.invoice_value || 0), 0).toFixed(2),
          total_taxable_value: data.reduce((s, r) => s + parseFloat(r.taxable_value || 0), 0).toFixed(2),
        },
        data: data.map((row) => ({
          receiver_name: row.receiver_name,
          invoice_no: row.invoice_no,
          invoice_date: row.invoice_date,
          invoice_value: parseFloat(row.invoice_value || 0).toFixed(2),
          place_of_supply: row.place_of_supply || null,
          taxable_value: parseFloat(row.taxable_value || 0).toFixed(2),
          tax_rate: parseFloat(row.tax_rate || 0).toFixed(3),
          igst_amount: parseFloat(row.igst_amount || 0).toFixed(2),
        })),
      });
    }

    if (section === "hsn") {
      // HSN Summary: group by HSN code
      // Tax amounts are on the bill header; we prorate by item share within each bill
      const dataSql = `
        SELECT
          si.hsn_code,
          SUM(COALESCE(si.quantity, 0))   AS total_qty,
          SUM(COALESCE(si.amount, 0))     AS taxable_value,
          SUM(
            CASE WHEN COALESCE(s.subtotal_amount, 0) > 0
              THEN COALESCE(si.amount, 0) / s.subtotal_amount * COALESCE(s.cgst_amount, 0)
              ELSE 0 END
          ) AS cgst_amount,
          SUM(
            CASE WHEN COALESCE(s.subtotal_amount, 0) > 0
              THEN COALESCE(si.amount, 0) / s.subtotal_amount * COALESCE(s.sgst_amount, 0)
              ELSE 0 END
          ) AS sgst_amount,
          SUM(
            CASE WHEN COALESCE(s.subtotal_amount, 0) > 0
              THEN COALESCE(si.amount, 0) / s.subtotal_amount * COALESCE(s.igst_amount, 0)
              ELSE 0 END
          ) AS igst_amount
        FROM sales_invoice_bill_items si
        JOIN sales_invoice_bills s ON s.id = si.invoice_bill_id
        WHERE s.deleted_at IS NULL AND si.deleted_at IS NULL
          AND s.status = 'Invoice'
          AND (:branch_id IS NULL OR s.branch_id = :branch_id)
          AND s.invoice_date BETWEEN :from_date AND :to_date
          AND si.hsn_code IS NOT NULL AND si.hsn_code != ''
        GROUP BY si.hsn_code
        ORDER BY si.hsn_code
      `;

      const data = await sequelize.query(dataSql, { replacements, type: sequelize.QueryTypes.SELECT });

      return commonService.okResponse(res, {
        section: "hsn",
        data: data.map((row) => ({
          hsn_code: row.hsn_code,
          total_qty: parseFloat(row.total_qty || 0).toFixed(3),
          taxable_value: parseFloat(row.taxable_value || 0).toFixed(2),
          cgst_amount: parseFloat(row.cgst_amount || 0).toFixed(2),
          sgst_amount: parseFloat(row.sgst_amount || 0).toFixed(2),
          igst_amount: parseFloat(row.igst_amount || 0).toFixed(2),
          total_tax: (parseFloat(row.cgst_amount || 0) + parseFloat(row.sgst_amount || 0) + parseFloat(row.igst_amount || 0)).toFixed(2),
        })),
      });
    }

    // Unknown section fallback
    return commonService.okResponse(res, { section, data: [] });
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
};
