-- =====================================================================
-- Trial-balance TALLY CHECK for the rewritten financialReportService CTE.
-- Self-contained; run in your SQL GUI against retailerpdb. Dates wide-open,
-- branch = ALL. PREREQUISITE: the chart of accounts must be seeded (Silver Sales,
-- Silver Purchase, Old Gold Purchase, GST Input/Output *, Scheme Collection
-- Liability, Discount Received, Cash in Hand/UPI/Card/Bank Accounts) — the CTE
-- anchors to those exact leaves, so a missing one drops its side and unbalances.
-- =====================================================================

-- (1) REPORT-ACCURATE tally (mirrors the Trial Balance: only postings that land on
--     an active ledger under an active group count). EXPECT difference = 0.00
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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR csp.branch_id = NULL)
      AND p.payment_date::date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR csp.branch_id = NULL)
      AND p.payment_date::date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR vp.branch_id = NULL)
      AND vp.payment_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR vp.branch_id = NULL)
      AND vp.payment_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR r.branch_id = NULL)
      AND r.receipt_date BETWEEN '2000-01-01' AND '2100-01-01'

    UNION ALL

    -- V.Cr  account_id ledger for manual receipt vouchers (non-scheme)
    --  account_id is a ledger id for bill_type 2/3 (verified in voucherReceiptService).
    SELECT lc.id, 0, COALESCE(r.amount, 0)
    FROM voucher_receipts r
    JOIN ledger lc ON lc.id = r.account_id AND lc.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.bill_type_id IN (2, 3)
      AND r.payment_mode_id IN (1,2,3,4,5)
      AND (NULL IS NULL OR r.branch_id = NULL)
      AND r.receipt_date BETWEEN '2000-01-01' AND '2100-01-01'

    UNION ALL

    /* =========================================================
       E) JOURNAL ENTRIES — kept as-is
       ========================================================= */
    SELECT jei.account_id, COALESCE(jei.debit, 0), COALESCE(jei.credit, 0)
    FROM journal_entry_items jei
    JOIN journal_entries je ON je.id = jei.journal_entry_id
    WHERE jei.deleted_at IS NULL AND je.deleted_at IS NULL
      AND (NULL IS NULL OR je.branch_id = NULL)
      AND je.date BETWEEN '2000-01-01' AND '2100-01-01'
  )
SELECT ROUND(SUM(t.debit), 2)  AS dr,
       ROUND(SUM(t.credit), 2) AS cr,
       ROUND(SUM(t.debit) - SUM(t.credit), 2) AS difference   -- expect 0.00
FROM ledger l
JOIN ledger_group lg ON lg.id = l.ledger_group_id
LEFT JOIN all_txns t ON t.ledger_id = l.id
WHERE l.deleted_at IS NULL AND lg.deleted_at IS NULL;

-- (2) DIAGNOSTIC — if (1) is non-zero, this shows postings whose anchored ledger
--     did NOT resolve (missing/inactive leaf). rows_with_null_ledger should be 0.
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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR s.branch_id = NULL)
      AND s.invoice_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR g.branch_id = NULL)
      AND g.grn_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR csp.branch_id = NULL)
      AND p.payment_date::date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR csp.branch_id = NULL)
      AND p.payment_date::date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR vp.branch_id = NULL)
      AND vp.payment_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR vp.branch_id = NULL)
      AND vp.payment_date BETWEEN '2000-01-01' AND '2100-01-01'

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
      AND (NULL IS NULL OR r.branch_id = NULL)
      AND r.receipt_date BETWEEN '2000-01-01' AND '2100-01-01'

    UNION ALL

    -- V.Cr  account_id ledger for manual receipt vouchers (non-scheme)
    --  account_id is a ledger id for bill_type 2/3 (verified in voucherReceiptService).
    SELECT lc.id, 0, COALESCE(r.amount, 0)
    FROM voucher_receipts r
    JOIN ledger lc ON lc.id = r.account_id AND lc.deleted_at IS NULL
    WHERE r.deleted_at IS NULL
      AND r.bill_type_id IN (2, 3)
      AND r.payment_mode_id IN (1,2,3,4,5)
      AND (NULL IS NULL OR r.branch_id = NULL)
      AND r.receipt_date BETWEEN '2000-01-01' AND '2100-01-01'

    UNION ALL

    /* =========================================================
       E) JOURNAL ENTRIES — kept as-is
       ========================================================= */
    SELECT jei.account_id, COALESCE(jei.debit, 0), COALESCE(jei.credit, 0)
    FROM journal_entry_items jei
    JOIN journal_entries je ON je.id = jei.journal_entry_id
    WHERE jei.deleted_at IS NULL AND je.deleted_at IS NULL
      AND (NULL IS NULL OR je.branch_id = NULL)
      AND je.date BETWEEN '2000-01-01' AND '2100-01-01'
  )
SELECT COUNT(*)                 AS rows_with_null_ledger,
       ROUND(SUM(debit), 2)     AS orphan_dr,
       ROUND(SUM(credit), 2)    AS orphan_cr
FROM all_txns
WHERE ledger_id IS NULL;
