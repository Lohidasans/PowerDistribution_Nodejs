const { sequelize } = require("../models/index");
const commonService = require("./commonService");
const { dateFilter } = require("../helpers/dateHelper");
const enumType = require("../constants/enum");


/* =========================================================
   HELPER – build date condition SQL from query params
   Supports: period (today|week|month|year|ytd) OR from_date + to_date
========================================================= */
const buildDateCondition = (
  { period, from_date, to_date },
  column,
  replacements,
  suffix = ""
) => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Determine financial year start (April 1)
  const fyStart =
    today.getMonth() + 1 >= 4 ? `${yyyy}-04-01` : `${yyyy - 1}-04-01`;

  const fromKey = `from_date${suffix}`;
  const toKey = `to_date${suffix}`;

  if (period) {
    switch (period) {
      case "today":
        replacements[fromKey] = todayStr;
        replacements[toKey] = todayStr;
        return ` AND DATE(${column}) BETWEEN :${fromKey} AND :${toKey}`;
      case "week": {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(today.getFullYear(), today.getMonth(), diff)
          .toISOString()
          .split("T")[0];
        replacements[fromKey] = weekStart;
        replacements[toKey] = todayStr;
        return ` AND DATE(${column}) BETWEEN :${fromKey} AND :${toKey}`;
      }
      case "month":
        replacements[fromKey] = `${yyyy}-${mm}-01`;
        replacements[toKey] = todayStr;
        return ` AND DATE(${column}) BETWEEN :${fromKey} AND :${toKey}`;
      case "year":
        replacements[fromKey] = `${yyyy}-01-01`;
        replacements[toKey] = todayStr;
        return ` AND DATE(${column}) BETWEEN :${fromKey} AND :${toKey}`;
      case "ytd":
        replacements[fromKey] = fyStart;
        replacements[toKey] = todayStr;
        return ` AND DATE(${column}) BETWEEN :${fromKey} AND :${toKey}`;
      default:
        break;
    }
  }

  if (from_date && to_date) {
    replacements[fromKey] = from_date;
    replacements[toKey] = to_date;
    return ` AND DATE(${column}) BETWEEN :${fromKey} AND :${toKey}`;
  }

  return "";
};

/* =========================================================
   MAIN DASHBOARD FUNCTION
========================================================= */
const getSuperAdminDashboard = async (req, res) => {
  try {
    const { branch_id, period, from_date, to_date, statistics_period } =
      req.query;

    const dateOpts = { period, from_date, to_date };

    // ── helpers ──────────────────────────────────────────────
    const money = (v) => Number(Number(v || 0).toFixed(2));
    const int = (v) => Number(v || 0);

    // ============================================================
    // 1. SALES KPI – FIXED (No double count) + MATCH SALES-REPORT RULES
    //    - status = 'Invoice'
    //    - date uses created_at (same as sales-report config)
    // ============================================================
    const buildSalesKPI = (labelPeriod, rep) => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayStr = `${yyyy}-${mm}-${dd}`;
      const fyStart =
        today.getMonth() + 1 >= 4 ? `${yyyy}-04-01` : `${yyyy - 1}-04-01`;

      let dateClause = "";
      if (labelPeriod === "today") {
        rep.s_from = todayStr;
        rep.s_to = todayStr;
        dateClause = `AND DATE(sib.created_at) BETWEEN :s_from AND :s_to`;
      } else if (labelPeriod === "month") {
        rep.s_from = `${yyyy}-${mm}-01`;
        rep.s_to = todayStr;
        dateClause = `AND DATE(sib.created_at) BETWEEN :s_from AND :s_to`;
      } else if (labelPeriod === "ytd") {
        rep.s_from = fyStart;
        rep.s_to = todayStr;
        dateClause = `AND DATE(sib.created_at) BETWEEN :s_from AND :s_to`;
      }
      // total => no date clause

      let branchClause = "";
      if (branch_id) {
        rep.s_branch = branch_id;
        branchClause = `AND sib.branch_id = :s_branch`;
      }

      return `
        WITH bills AS (
          SELECT sib.id, sib.net_total, sib.total_amount
          FROM sales_invoice_bills sib
          WHERE sib.deleted_at IS NULL
            AND sib.is_active = true
            AND sib.status = 'Invoice'
            ${dateClause}
            ${branchClause}
        ),
        items AS (
          SELECT
            i.invoice_bill_id,
            COALESCE(SUM(i.quantity), 0) AS total_quantity,
            COALESCE(SUM(i.gross_weight * i.quantity), 0) AS total_gross_weight,
            COALESCE(SUM(i.net_weight * i.quantity), 0) AS total_net_weight
          FROM sales_invoice_bill_items i
          WHERE i.deleted_at IS NULL
          GROUP BY i.invoice_bill_id
        )
        SELECT
          COUNT(b.id)::int                                  AS bill_count,
          COALESCE(SUM(it.total_quantity), 0)               AS total_quantity,
          COALESCE(SUM(it.total_gross_weight), 0)           AS total_gross_weight,
          COALESCE(SUM(it.total_net_weight), 0)             AS total_net_weight,
          COALESCE(SUM(b.net_total), 0)                     AS net_total,
          COALESCE(SUM(b.total_amount), 0)                  AS total_amount
        FROM bills b
        LEFT JOIN items it ON it.invoice_bill_id = b.id
      `;
    };

    // ============================================================
    // 3. STATISTICS – (OPTIONAL) You may want to match sales-report here too:
    //    If you want: use created_at + status='Invoice'
    //    For now keeping your existing logic (invoice_date + not in Draft/Cancelled)
    // ============================================================
    const statsRep = {};
    const statsBranch = branch_id ? `AND sib.branch_id = :stat_branch` : "";
    if (branch_id) statsRep.stat_branch = branch_id;

    let monthsInterval = 11;
    let dateFormat = "YYYY-MM";

    if (statistics_period === "monthly") {
      monthsInterval = 0;
      dateFormat = "YYYY-MM-DD";
    } else if (statistics_period === "half_yearly") {
      monthsInterval = 5;
      dateFormat = "YYYY-MM";
    } else if (statistics_period === "yearly" || statistics_period === "year") {
      monthsInterval = 11;
      dateFormat = "YYYY-MM";
    }

    const statisticsQuery = `
      WITH months AS (
        SELECT
          TO_CHAR(generate_series(
            DATE_TRUNC('month', NOW() - INTERVAL '${monthsInterval} months'),
            DATE_TRUNC('month', NOW()),
            '1 month'::interval
          ), '${dateFormat}') AS month_key
      ),
      monthly_sales AS (
        SELECT
          TO_CHAR(sib.invoice_date, '${dateFormat}') AS month_key,
          COALESCE(SUM(sib.total_amount), 0)         AS sales_amount
        FROM sales_invoice_bills sib
        WHERE sib.deleted_at IS NULL 
          AND sib.is_active = true
          AND sib.status NOT IN ('Draft', 'Cancelled')
          ${statsBranch}
        GROUP BY TO_CHAR(sib.invoice_date, '${dateFormat}')
      ),
      monthly_purchase AS (
        SELECT
          TO_CHAR(g.grn_date, '${dateFormat}') AS month_key,
          COALESCE(SUM(g.total_amount), 0)     AS purchase_amount
        FROM grns g
        WHERE g.deleted_at IS NULL
          AND g.is_active IS NOT FALSE
        GROUP BY TO_CHAR(g.grn_date, '${dateFormat}')
      )
      SELECT
        m.month_key,
        TO_CHAR(
          TO_DATE(m.month_key, '${dateFormat}'),
          '${statistics_period === "monthly" ? "DD Mon YYYY" : "Mon YYYY"}'
        ) AS month_label,
        COALESCE(ms.sales_amount, 0)    AS sales,
        COALESCE(mp.purchase_amount, 0) AS purchase,
        GREATEST(COALESCE(ms.sales_amount, 0) - COALESCE(mp.purchase_amount, 0), 0) AS profit
      FROM months m
      LEFT JOIN monthly_sales ms ON ms.month_key = m.month_key
      LEFT JOIN monthly_purchase mp ON mp.month_key = m.month_key
      ORDER BY m.month_key ASC
    `;

    // ============================================================
    // 5. AMOUNT COLLECTION - MATCH branch-wise revenue stream
    // ============================================================
    const collRep = {};
    const collDateCond = buildDateCondition(
      dateOpts,
      "rs.txn_date",
      collRep,
      "_coll"
    );
    const collBranch = branch_id ? `AND rs.branch_id = :coll_branch` : "";
    if (branch_id) collRep.coll_branch = branch_id;

    const amountCollectionQuery = `
      WITH revenue_stream AS (
        SELECT
          COALESCE(sib.branch_id, jr.branch_id) AS branch_id,
          p.payment_date AS txn_date,
          p.payment_mode::text AS payment_mode,
          CASE
            WHEN sib.id IS NOT NULL
              AND p.payment_mode = 'Cash'
            THEN
              p.amount_received
              - COALESCE(
                  MAX(sib.refund_amount) OVER (PARTITION BY sib.id),
                  0
                )
            ELSE p.amount_received
          END AS amount
        FROM payments p
        LEFT JOIN sales_invoice_bills sib
          ON sib.id = p.invoice_bill_id
          AND sib.deleted_at IS NULL
          AND sib.is_active = true
        LEFT JOIN jewel_repairs jr
          ON jr.id = p.jewel_repair_id
          AND jr.deleted_at IS NULL
          AND jr.is_active = true
        WHERE p.deleted_at IS NULL
          AND p.status = 'Completed'
          AND (sib.id IS NOT NULL OR jr.id IS NOT NULL)

        UNION ALL

        SELECT
          vr.branch_id,
          vr.receipt_date AS txn_date,
          pm.payment_mode,
          vr.amount
        FROM voucher_receipts vr
        JOIN payment_modes pm ON pm.id = vr.payment_mode_id
        WHERE vr.deleted_at IS NULL
          AND vr.is_active = true

        UNION ALL

        SELECT
          sp.branch_id,
          p.payment_date AS txn_date,
          p.payment_mode::text AS payment_mode,
          p.amount_received AS amount
        FROM customer_scheme_payments sp
        JOIN payments p
          ON p.scheme_payment_id = sp.id
          AND p.deleted_at IS NULL
          AND p.status = 'Completed'
        WHERE sp.deleted_at IS NULL
          AND sp.payment_source = 'INSTALLMENT'

        UNION ALL

        SELECT
          vp.branch_id,
          vp.payment_date AS txn_date,
          pm.payment_mode,
          -vp.amount AS amount
        FROM vendor_payments vp
        JOIN payment_modes pm ON pm.id = vp.payment_mode
        WHERE vp.deleted_at IS NULL
          AND vp.is_active = true
          AND vp.status = 'Completed'
      )
      SELECT
        ROUND(COALESCE(SUM(CASE WHEN rs.payment_mode = 'Cash'          THEN rs.amount ELSE 0 END), 0), 2) AS cash,
        ROUND(COALESCE(SUM(CASE WHEN rs.payment_mode = 'UPI'           THEN rs.amount ELSE 0 END), 0), 2) AS upi,
        ROUND(COALESCE(SUM(CASE WHEN rs.payment_mode = 'Card'          THEN rs.amount ELSE 0 END), 0), 2) AS card,
        ROUND(COALESCE(SUM(CASE WHEN rs.payment_mode = 'Bank Transfer' THEN rs.amount ELSE 0 END), 0), 2) AS bank_transfer,
        ROUND(COALESCE(SUM(CASE WHEN rs.payment_mode = 'Cheque'        THEN rs.amount ELSE 0 END), 0), 2) AS cheque,
        ROUND(COALESCE(SUM(CASE WHEN rs.payment_mode = 'Other'         THEN rs.amount ELSE 0 END), 0), 2) AS other,
        ROUND(COALESCE(SUM(rs.amount), 0), 2) AS total
      FROM revenue_stream rs
      WHERE 1=1
        ${collDateCond}
        ${collBranch}
    `;

    // ============================================================
    // 6. JEWEL ACTIVITY KPI
    // ============================================================
    const jewRep = {};
    const jewDateCond = buildDateCondition(
      dateOpts,
      "sr.created_at",
      jewRep,
      "_jew"
    );
    const jewBranch = branch_id ? `AND sr.branch_id = :jew_branch` : "";
    if (branch_id) jewRep.jew_branch = branch_id;

    const salesReturnQuery = `
      WITH items AS (
        SELECT
          sri.sales_return_id,
          COALESCE(SUM(sri.quantity), 0) AS total_quantity,
          COALESCE(SUM(sri.gross_weight::numeric), 0) AS total_gross_weight,
          COALESCE(SUM((sri.net_weight::numeric * sri.quantity)), 0) AS total_net_weight
        FROM sales_return_items sri
        WHERE sri.deleted_at IS NULL
        GROUP BY sri.sales_return_id
      )
      SELECT
        COUNT(sr.id)::int AS bill_count,
        COALESCE(SUM(i.total_quantity), 0) AS total_quantity,
        COALESCE(SUM(i.total_gross_weight), 0) AS total_gross_weight,
        COALESCE(SUM(i.total_net_weight), 0) AS total_net_weight,
        COALESCE(SUM(sr.total_amount), 0) AS total_amount
      FROM sales_returns sr
      LEFT JOIN items i ON i.sales_return_id = sr.id
      WHERE sr.deleted_at IS NULL
        AND sr.is_active = true
        AND sr.status = 'Printed'
        ${jewDateCond}
        ${jewBranch}
    `;

    const ojRep = {};
    const ojDateCond = buildDateCondition(dateOpts, "oj.date", ojRep, "_oj");
    const ojBranch = branch_id ? `AND oj.branch_id = :oj_branch` : "";
    if (branch_id) ojRep.oj_branch = branch_id;

    const oldJewelQuery = `
      SELECT
        COUNT(DISTINCT oj.id)::int AS bill_count,
        COUNT(oji.id)::int AS total_quantity,
        COALESCE(SUM(oji.net_weight), 0) AS total_weight,

        COALESCE(
          (
            SELECT SUM(oj2.total_amount)
            FROM old_jewels oj2
            WHERE oj2.deleted_at IS NULL
              AND oj2.is_active = true
              AND oj2.status = 'Printed'
              ${ojDateCond.replace(/oj\./g, "oj2.")}
              ${ojBranch.replace(/oj\./g, "oj2.")}
          ),
          0
        ) AS total_amount

      FROM old_jewels oj

      LEFT JOIN old_jewel_items oji
        ON oji.old_jewel_id = oj.id
        AND oji.deleted_at IS NULL

      WHERE oj.deleted_at IS NULL
        AND oj.is_active = true
        AND oj.status = 'Printed'
        ${ojDateCond}
        ${ojBranch}
    `;

    const jrRep = {};
    const jrDateCond = buildDateCondition(dateOpts, "jr.created_at", jrRep, "_jr");
    const jrBranch = branch_id ? `AND jr.branch_id = :jr_branch` : "";
    if (branch_id) jrRep.jr_branch = branch_id;

    const jewelRepairQuery = `
    WITH items AS (
      SELECT
        jri.repair_id,
        COALESCE(SUM(jri.quantity), 0) AS total_quantity,
        COALESCE(SUM(jri.weight * jri.quantity), 0) AS total_weight
      FROM jewel_repair_items jri
      WHERE jri.deleted_at IS NULL
      GROUP BY jri.repair_id
    )
    SELECT
      COUNT(jr.id)::int AS bill_count,
      COALESCE(SUM(i.total_quantity), 0) AS total_quantity,
      COALESCE(SUM(i.total_weight), 0) AS total_weight,
      COALESCE(SUM(jr.total_amount), 0) AS total_amount
    FROM jewel_repairs jr
    LEFT JOIN items i ON i.repair_id = jr.id
    WHERE jr.deleted_at IS NULL
      AND jr.is_active = true
      AND jr.status = 'Completed'
      ${jrDateCond}
      ${jrBranch}
  `;

    const dcRep = {};
    const dcDateCond = buildDateCondition(dateOpts, "dc.date", dcRep, "_dc");
    const dcBranch = branch_id ? `AND dc.branch_id = :dc_branch` : "";
    if (branch_id) dcRep.dc_branch = branch_id;

    const deliveryChallanQuery = `
      SELECT
        COUNT(dc.id)::int                 AS challan_count,
        COALESCE(SUM(dc.total_amount), 0) AS total_amount
      FROM delivery_chellan dc
      WHERE dc.deleted_at IS NULL
        ${dcDateCond}
        ${dcBranch}
    `;

    // ============================================================
    // 7. VENDOR OVERVIEW
    // ============================================================
    const vendorOverviewQuery = `
    SELECT
        COALESCE(SUM(g.total_amount),0) AS total_purchase,
        COALESCE((SELECT SUM(COALESCE(pr.subtotal_amount,0) + (
                  COALESCE(pr.subtotal_amount,0) * (COALESCE(pr.sgst_percent,0) + COALESCE(pr.cgst_percent,0) + COALESCE(pr.igst_percent,0)) / 100))
            FROM purchase_returns pr
            WHERE pr.deleted_at IS NULL
          ), 0
        ) AS purchase_return

    FROM grns g
    WHERE g.deleted_at IS NULL
    AND g.is_active IS NOT FALSE
    `;

    const vendorPaidQuery = `
      SELECT 
          COALESCE(SUM(total_payments),0) AS total_paid
      FROM (

          -- Bill by Bill Payments
          SELECT 
              SUM(vp.amount) AS total_payments
          FROM vendor_payments vp
          JOIN grns g 
              ON g.id = vp.purchase_id::integer
              AND g.deleted_at IS NULL
          WHERE vp.deleted_at IS NULL
              AND vp.status = 'Completed'
              AND vp.is_active = true
              AND vp.user_type_id = 1
              AND vp.bill_type_id = 1

          UNION ALL

          -- On Account + Advance Payments
          SELECT 
              SUM(vp.amount) AS total_payments
          FROM vendor_payments vp
          JOIN vendors v 
              ON v.ledger_id = vp.account_name_id
          WHERE vp.deleted_at IS NULL
              AND vp.status = 'Completed'
              AND vp.is_active = true
              AND vp.bill_type_id IN (2,3)

      )x
      `;

    // ============================================================
    // 8. PURCHASE VS SALES STATISTICS (vendor-wise)
    // ============================================================
    const pvRep = {};
    const pvSalesBranch = branch_id ? `AND sib.branch_id = :pv_branch` : "";
    if (branch_id) pvRep.pv_branch = branch_id;

    const purchaseVsSalesQuery = `
      WITH vendor_purchase AS (
        SELECT
          g.vendor_id,
          COALESCE(SUM(g.total_amount), 0)           AS purchase_amount,
          COALESCE(SUM(gi.quantity), 0)::int         AS purchase_qty,
          COALESCE(SUM(g.total_gross_wt_in_g), 0)    AS purchase_weight
        FROM grns g
        LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
        WHERE g.deleted_at IS NULL
          AND g.is_active IS NOT FALSE
        GROUP BY g.vendor_id
      ),
      vendor_sales AS (
        SELECT
          p.vendor_id,
          COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0) AS sales_amount,
          COALESCE(SUM(sibi.quantity - COALESCE(sibi.returned_quantity, 0)), 0)::int AS sales_qty,
          COALESCE(SUM(sibi.net_weight * (sibi.quantity - COALESCE(sibi.returned_quantity, 0))), 0)    AS sales_weight
        FROM sales_invoice_bill_items sibi
        JOIN products p
          ON p.id = sibi.product_id AND p.deleted_at IS NULL
        JOIN sales_invoice_bills sib
          ON sib.id = sibi.invoice_bill_id
          AND sib.deleted_at IS NULL AND sib.is_active = true
          AND sib.status='Invoice'
          ${pvSalesBranch}
        WHERE sibi.deleted_at IS NULL
        GROUP BY p.vendor_id
      )
      SELECT
        v.id            AS vendor_id,
        v.vendor_name,
        COALESCE(vp.purchase_amount, 0) AS purchase_amount,
        COALESCE(vp.purchase_qty,    0) AS purchase_qty,
        COALESCE(vp.purchase_weight, 0) AS purchase_weight,
        COALESCE(vs.sales_amount,    0) AS sales_amount,
        COALESCE(vs.sales_qty,       0) AS sales_qty,
        COALESCE(vs.sales_weight,    0) AS sales_weight
      FROM vendors v
      LEFT JOIN vendor_purchase vp ON vp.vendor_id = v.id
      LEFT JOIN vendor_sales    vs ON vs.vendor_id = v.id
      WHERE v.deleted_at IS NULL
        AND (COALESCE(vp.purchase_amount, 0) > 0 OR COALESCE(vs.sales_amount, 0) > 0)
      ORDER BY v.vendor_name ASC
    `;

    // ============================================================
    // EXECUTE ALL QUERIES IN PARALLEL
    // ============================================================
    const todayRep = {};
    const monthRep = {};
    const ytdRep = {};
    const totalRep = {};

    const [
      [todayResult],
      [monthResult],
      [ytdResult],
      [totalResult],
      statisticsResult,
      [collectionResult],
      [srResult],
      [ojResult],
      [jrResult],
      [dcResult],
      [vendorPurchaseResult],
      [vendorPaidResult],
      purchaseVsSalesResult,
    ] = await Promise.all([
      sequelize.query(buildSalesKPI("today", todayRep), {
        replacements: todayRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(buildSalesKPI("month", monthRep), {
        replacements: monthRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(buildSalesKPI("ytd", ytdRep), {
        replacements: ytdRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(buildSalesKPI("total", totalRep), {
        replacements: totalRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(statisticsQuery, {
        replacements: statsRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(amountCollectionQuery, {
        replacements: collRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(salesReturnQuery, {
        replacements: jewRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(oldJewelQuery, {
        replacements: ojRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(jewelRepairQuery, {
        replacements: jrRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(deliveryChallanQuery, {
        replacements: dcRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(vendorOverviewQuery, {
        replacements: {},
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(vendorPaidQuery, {
        replacements: {},
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(purchaseVsSalesQuery, {
        replacements: pvRep,
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    const totalPurchase = money(vendorPurchaseResult?.total_purchase);
    const totalPurchaseReturn = money(vendorPurchaseResult?.purchase_return);
    const totalPaid = money(vendorPaidResult?.total_paid);
    const outstandingPayable = money(totalPurchase - totalPurchaseReturn - totalPaid);

    return commonService.okResponse(res, {
      filters_applied: {
        branch_id: branch_id || null,
        period: period || null,
        statistics_period: statistics_period || "yearly",
        from_date: from_date || null,
        to_date: to_date || null,
      },

      sales_kpi: {
        today: {
          bill_count: int(todayResult?.bill_count),
          total_quantity: int(todayResult?.total_quantity),
          total_gross_weight: Number(Number(todayResult?.total_gross_weight || 0).toFixed(3)),
          total_net_weight: Number(Number(todayResult?.total_net_weight || 0).toFixed(3)),
          net_total: money(todayResult?.net_total),
          total_amount: money(todayResult?.total_amount),
        },
        this_month: {
          bill_count: int(monthResult?.bill_count),
          total_quantity: int(monthResult?.total_quantity),
          total_gross_weight: Number(Number(monthResult?.total_gross_weight || 0).toFixed(3)),
          total_net_weight: Number(Number(monthResult?.total_net_weight || 0).toFixed(3)),
          net_total: money(monthResult?.net_total),
          total_amount: money(monthResult?.total_amount),
        },
        ytd: {
          bill_count: int(ytdResult?.bill_count),
          total_quantity: int(ytdResult?.total_quantity),
          total_gross_weight: Number(Number(ytdResult?.total_gross_weight || 0).toFixed(3)),
          total_net_weight: Number(Number(ytdResult?.total_net_weight || 0).toFixed(3)),
          net_total: money(ytdResult?.net_total),
          total_amount: money(ytdResult?.total_amount),
        },
        total: {
          bill_count: int(totalResult?.bill_count),
          total_quantity: int(totalResult?.total_quantity),
          total_gross_weight: Number(Number(totalResult?.total_gross_weight || 0).toFixed(3)),
          total_net_weight: Number(Number(totalResult?.total_net_weight || 0).toFixed(3)),
          net_total: money(totalResult?.net_total),
          total_amount: money(totalResult?.total_amount),
        },
      },

      statistics: (statisticsResult || []).map((r) => ({
        month_key: r.month_key,
        month_label: r.month_label,
        sales: money(r.sales),
        purchase: money(r.purchase),
        profit: money(r.profit),
      })),

      // refund deducted
      amount_collection: {
        cash: money(collectionResult?.cash),
        upi: money(collectionResult?.upi),
        card: money(collectionResult?.card),
        bank_transfer: money(collectionResult?.bank_transfer),
        cheque: money(collectionResult?.cheque),
        other: money(collectionResult?.other),
        total: money(collectionResult?.total),
      },

      jewel_activity: {
        sales_return: {
          bill_count: int(srResult?.bill_count),
          total_quantity: int(srResult?.total_quantity),
          total_gross_weight: Number(Number(srResult?.total_gross_weight || 0).toFixed(3)),
          total_net_weight: Number(Number(srResult?.total_net_weight || 0).toFixed(3)),
          total_amount: money(srResult?.total_amount),
        },
        old_jewel: {
          bill_count: int(ojResult?.bill_count),
          total_quantity: int(ojResult?.total_quantity),
          total_weight: Number(Number(ojResult?.total_weight || 0).toFixed(3)),
          total_amount: money(ojResult?.total_amount),
        },
        jewel_repair: {
          bill_count: int(jrResult?.bill_count),
          total_quantity: Number(Number(jrResult?.total_quantity || 0).toFixed(2)),
          total_weight: Number(Number(jrResult?.total_weight || 0).toFixed(3)),
          total_amount: money(jrResult?.total_amount),
        },
        delivery_challan: {
          challan_count: int(dcResult?.challan_count),
          total_amount: money(dcResult?.total_amount),
        },
      },

      vendor_overview: {
        total_purchase: totalPurchase,
        purchase_return: totalPurchaseReturn,
        total_paid: totalPaid,
        outstanding_payable: outstandingPayable,
      },

      purchase_vs_sales: (purchaseVsSalesResult || []).map((r) => ({
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_name,
        purchase_amount: money(r.purchase_amount),
        purchase_qty: int(r.purchase_qty),
        purchase_weight: Number(Number(r.purchase_weight || 0).toFixed(3)),
        sales_amount: money(r.sales_amount),
        sales_qty: int(r.sales_qty),
        sales_weight: Number(Number(r.sales_weight || 0).toFixed(3)),
      })),
    });
  } catch (error) {
    console.error("getSuperAdminDashboard Error:", error);
    return commonService.handleError(res, error);
  }
};


const getSalesSummary = async (req, res) => {
  try {
    const {
      branch_id,     // OPTIONAL
      from_date,
      to_date,
      date_filter
    } = req.query;

    const replacements = {};

    const dateCondition = dateFilter(
      { from_date, to_date, date_filter },
      "sib.invoice_date",
      replacements
    );

    let branchCondition = "";
    if (branch_id) {
      branchCondition = " AND sib.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT 
          COALESCE(SUM(sib.subtotal_amount), 0) AS total_sales
      FROM sales_invoice_bills sib
      WHERE sib.status = 'Invoice'
        AND sib.is_active = true
        AND sib.deleted_at IS NULL
        ${branchCondition}
        ${dateCondition}
    `;

    const [result] = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    return res.json({
      success: true,
      data: {
        total_sales: Number(result.total_sales)
      }
    });

  } catch (error) {
    console.error("Sales Summary Error:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};


const getProfitKPISummary = async (req, res) => {
  try {
    const {
      branch_id,      // OPTIONAL now
      from_date,
      to_date,
      date_filter
    } = req.query;

    const replacements = {};

    // Date condition (shared)
    const dateCondition = dateFilter(
      { from_date, to_date, date_filter },
      "sib.invoice_date",
      replacements
    );

    // Optional branch condition
    let branchCondition = "";
    if (branch_id) {
      branchCondition = " AND sib.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT
        /* TOTAL SALES */
        COALESCE((
            SELECT SUM(sib.subtotal_amount)
            FROM sales_invoice_bills sib
            WHERE sib.status = 'Invoice'
              AND sib.is_active = true
              AND sib.deleted_at IS NULL
              ${branchCondition}
              ${dateCondition}
        ), 0) AS total_sales,

        /* TOTAL PURCHASE (ONLY SOLD ITEMS, WITH QUANTITY) */
        COALESCE((
            SELECT SUM(
                COALESCE(gi.rate_per_g, 0)
                * COALESCE(pid.net_weight, 0)
                * (COALESCE(sibi.quantity, 1) - COALESCE(sibi.returned_quantity, 0))
            )
            FROM sales_invoice_bill_items sibi
            INNER JOIN sales_invoice_bills sib
                ON sib.id = sibi.invoice_bill_id
            INNER JOIN products p
                ON p.id = sibi.product_id
            INNER JOIN "grnItems" gi
                ON gi.grn_id = p.grn_id
               AND gi.id = p.ref_no_id
            INNER JOIN "productItemDetails" pid
                ON pid.id = sibi.product_item_detail_id
            WHERE sib.status = 'Invoice'
              AND sib.deleted_at IS NULL
              AND sib.is_active = true
              AND sibi.deleted_at IS NULL
              AND p.deleted_at IS NULL
              AND gi.deleted_at IS NULL
              AND pid.deleted_at IS NULL
              ${branchCondition}
              ${dateCondition}
        ), 0) AS total_purchase
    `;

    const [result] = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const sales = Number(result.total_sales);
    const purchase = Number(result.total_purchase);

    return res.json({
      success: true,
      data: {
        sales,
        purchase,
        profit: sales - purchase
      }
    });

  } catch (error) {
    console.error("Profit KPI Error:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};


const getStockKpiSummary = async (req, res) => {
  try {
    const {
      branch_id,
      from_date,
      to_date,
      start_date,
      end_date,
      date_filter, // today | week | month | year
    } = req.query;

    // normalize date params
    const normalizedFromDate = from_date || start_date;
    const normalizedToDate = to_date || end_date;

    const money = (v) => Number(Number(v || 0).toFixed(2));
    const int = (v) => Number(v || 0);

    const replacements = {};

    if (branch_id) {
      replacements.branch_id = branch_id;
    }

    // Date filter on GRN date
    const grnDateCondition = dateFilter(
      {
        from_date: normalizedFromDate,
        to_date: normalizedToDate,
        date_filter,
      },
      "g.grn_date",
      replacements
    );

    /* =====================================================
       SOURCE OF TRUTH
       ===================================================== */

    const grnWeightsCTE = `
      WITH grn_weights AS (
        SELECT
          g.id AS grn_id,

          COALESCE(pi.total_updated_weight, 0) AS updated_weight,
          COALESCE(pi.total_updated_qty, 0) AS updated_qty

        FROM grns g

        LEFT JOIN (

          SELECT
            p.grn_id,

            /* =========================================
              UPDATED WEIGHT
              ========================================= */

            -- CURRENT STOCK
            COALESCE(SUM(pid.quantity * pid.gross_weight), 0)

            -- OFFLINE SOLD
            + COALESCE(
                SUM(
                  CASE
                    WHEN sib.status = 'Invoice'
                    THEN (sii.quantity - COALESCE(sii.returned_quantity, 0)) * sii.gross_weight
                    ELSE 0
                  END
                ),
              0)

            -- ONLINE ORDER SOLD
            + COALESCE(
                SUM(
                  CASE
                    WHEN oi.item_status != 'Cancelled'
                    THEN oi.quantity * pid.gross_weight
                    ELSE 0
                  END
                ),
              0)

            AS total_updated_weight,

            /* =========================================
              UPDATED QTY
              ========================================= */

            -- CURRENT STOCK
            COALESCE(SUM(pid.quantity), 0)

            -- OFFLINE SOLD
            + COALESCE(
                SUM(
                  CASE
                    WHEN sib.status = 'Invoice'
                    THEN (sii.quantity - COALESCE(sii.returned_quantity, 0))
                    ELSE 0
                  END
                ),
              0)

            -- ONLINE ORDER SOLD
            + COALESCE(
                SUM(
                  CASE
                    WHEN oi.item_status != 'Cancelled'
                    THEN oi.quantity
                    ELSE 0
                  END
                ),
              0)

            AS total_updated_qty

          FROM products p

          JOIN "productItemDetails" pid
            ON pid.product_id = p.id
            AND pid.deleted_at IS NULL

          /* =========================================
            OFFLINE BILL SOLD
            ========================================= */

          -- Kept as a row filter so a fully returned line does not join and
          -- inflate the SUM(pid.quantity) fan-out; partially returned lines
          -- still join and are prorated by the CASEs above.
          LEFT JOIN sales_invoice_bill_items sii
            ON sii.product_item_detail_id = pid.id
            AND sii.deleted_at IS NULL
            AND (sii.quantity - COALESCE(sii.returned_quantity, 0)) > 0

          LEFT JOIN sales_invoice_bills sib
            ON sib.id = sii.invoice_bill_id
            AND sib.deleted_at IS NULL

          /* =========================================
            ONLINE ORDER SOLD
            ========================================= */

          LEFT JOIN order_items oi
            ON oi.product_item_id = pid.id
            AND oi.deleted_at IS NULL
            AND oi.item_status != 'Cancelled'

          WHERE p.deleted_at IS NULL

          GROUP BY p.grn_id
        ) pi ON pi.grn_id = g.id

        WHERE g.deleted_at IS NULL
        ${branch_id ? `AND g.branch_id = :branch_id` : ``}
        ${grnDateCondition}
      )
    `;

    /* =====================================================
       1. TOTAL PURCHASE
       ===================================================== */

    const totalPurchaseQuery = `
      SELECT
        COALESCE(SUM(gi.total_amount), 0) AS total_amount,

        COALESCE(SUM(gi.quantity), 0)::int AS total_quantity,
        COALESCE(SUM(gi.net_wt_in_g), 0) AS total_weight

      FROM "grnItems" gi
      JOIN grns g
        ON g.id = gi.grn_id
        AND g.deleted_at IS NULL
        AND g.is_active IS NOT FALSE
      WHERE gi.deleted_at IS NULL
      ${branch_id ? `AND g.branch_id = :branch_id` : ``}    -- to include only the particular branch pdt not the transferred pdt
   
      ${grnDateCondition}
    `;

    /* =====================================================
       2. UPDATED
       ===================================================== */
    const updatedQuery = `
      ${grnWeightsCTE}
      SELECT
        COALESCE(SUM(updated_qty), 0)::int AS total_quantity,
        COALESCE(SUM(updated_weight), 0) AS total_weight
      FROM grn_weights
    `;

    /* =====================================================
       3. TOTAL STOCK
       ===================================================== */
    const totalStockQuery = `
      SELECT
        COALESCE(SUM(pid.quantity), 0)::int AS total_quantity,
        COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight,
        COALESCE(SUM((COALESCE(gi.rate_per_g, 0) * COALESCE(pid.net_weight, 0)) * COALESCE(pid.quantity, 0)), 0) AS total_amount
      
      FROM products p
      JOIN "productItemDetails" pid ON pid.product_id = p.id AND pid.deleted_at IS NULL AND pid.quantity > 0
      LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
      WHERE p.deleted_at IS NULL AND p.status = 'Active'
      ${branch_id ? `AND p.branch_id = :branch_id` : ``}
    `;
    
    /* =====================================================
       EXECUTION
       ===================================================== */

    const [
      [purchaseResult],
      [updatedResult],
      [totalStockResult],
    ] = await Promise.all([
      sequelize.query(totalPurchaseQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),

      sequelize.query(updatedQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),

      sequelize.query(totalStockQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    /* =====================================================
       YET TO UPDATE
       ===================================================== */

    const yetToUpdateQuantity =
      Number(purchaseResult?.total_quantity || 0)
      -
      Number(updatedResult?.total_quantity || 0);

    const yetToUpdateWeight =
      Number(purchaseResult?.total_weight || 0)
      -
      Number(updatedResult?.total_weight || 0);

    /* =====================================================
       RESPONSE
       ===================================================== */

    return commonService.okResponse(res, {
      filters_applied: {
        branch_id: branch_id || null,
        date_filter: date_filter || null,
        from_date: normalizedFromDate || null,
        to_date: normalizedToDate || null,
      },
      data: {

        /* =========================================
           TOTAL PURCHASE
           ========================================= */

        total_purchase: {
          total_amount: money(purchaseResult?.total_amount),
          total_quantity: int(purchaseResult?.total_quantity),
          total_weight: Number(
            Number(purchaseResult?.total_weight || 0).toFixed(3)
          ),
        },

        /* =========================================
           UPDATED
           ========================================= */

        updated: {
          total_quantity: int(updatedResult?.total_quantity),
          total_weight: Number(
            Number(updatedResult?.total_weight || 0).toFixed(3)
          ),
        },

        /* =========================================
           YET TO UPDATE
           ========================================= */

        yet_to_update: {
          total_quantity: yetToUpdateQuantity,
          total_weight: Number(yetToUpdateWeight.toFixed(3)),
        },

        /* =========================================
           TOTAL STOCK
           ========================================= */

        total_stock: {
          total_quantity: int(totalStockResult?.total_quantity),
          total_weight: Number(Number(totalStockResult?.total_weight || 0).toFixed(3)
          ),
          total_amount: money(totalStockResult?.total_amount),
        },
      },
    });
  } catch (error) {
    console.error("getStockKpiSummary Error:", error);
    return commonService.handleError(res, error);
  }
};


const getProfitSection = async (req, res) => {
  try {
    const {
      branch_id,
      from_date,
      to_date,
      date_filter,
    } = req.query;

    const CAPITAL_CUTOFF_DATE = "2026-01-27";
    const replacements = {};

    if (branch_id) {
      replacements.branch_id = branch_id;
    }

    const capitalBranchFilter = branch_id
      ? ` AND grn.branch_id = :branch_id`
      : "";

    const salesBranchFilter = branch_id
      ? ` AND sib.branch_id = :branch_id`
      : "";

    const oldJewelBranchFilter = branch_id
      ? ` AND oj.branch_id = :branch_id`
      : "";

    const purchaseBranchFilter = branch_id
      ? ` AND grn.branch_id = :branch_id`
      : "";

    const collectionBranchFilter = branch_id
      ? ` AND cs.branch_id = :branch_id`
      : "";

    const expenseBranchFilter = branch_id
      ? ` AND vp.branch_id = :branch_id`
      : "";

    const silverRateBranchFilter = branch_id
      ? ` AND mt.branch_id = :branch_id`
      : "";

    // Date filters use the selected filter:
    // today / week / month / year / custom from_date and to_date.
    const salesDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "sib.invoice_date",
      replacements
    );

    const oldJewelDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "oj.date",
      replacements
    );

    const purchaseDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "grn.grn_date",
      replacements
    );

    const collectionDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "cs.txn_date",
      replacements
    );

    const expenseDateFilter = dateFilter(
      { from_date, to_date, date_filter },
      "vp.payment_date",
      replacements
    );

    const [
      capitalRows,
      salesRows,
      oldJewelRows,
      purchaseRows,
      collectionRows,
      expenseRows,
      silverRateRows,
    ] = await Promise.all([
      // CAPITAL:
      // Static date cutoff before 27-Jan-2026.
      // Branch filter applies when branch_id is sent.
      sequelize.query(
        `
          SELECT
            COALESCE(SUM(grn.total_gross_wt_in_g), 0) AS total_weight_in_grams,
            COALESCE(SUM(grn.total_amount), 0) AS total_value
          FROM grns grn
          WHERE grn.deleted_at IS NULL
            AND grn.is_active = true
            AND grn.grn_date < :capitalCutoffDate
            ${capitalBranchFilter}
        `,
        {
          replacements: {
            ...replacements,
            capitalCutoffDate: CAPITAL_CUTOFF_DATE,
          },
          type: sequelize.QueryTypes.SELECT,
        }
      ),

      // SALES:
      // Sales invoice GST raised weight and value for selected date range.
      sequelize.query(
        `
          WITH valid_invoices AS (
            SELECT
              sib.id,
              sib.total_amount
            FROM sales_invoice_bills sib
            WHERE sib.deleted_at IS NULL
              AND sib.is_active = true
              AND sib.status = 'Invoice'
              ${salesBranchFilter}
              ${salesDateFilter}
          )
          SELECT
            COALESCE(
              (
                SELECT SUM(
                  COALESCE(sii.gross_weight, 0)
                  * (COALESCE(sii.quantity, 1) - COALESCE(sii.returned_quantity, 0))
                )
                FROM sales_invoice_bill_items sii
                INNER JOIN valid_invoices vi
                  ON vi.id = sii.invoice_bill_id
                WHERE sii.deleted_at IS NULL
              ),
              0
            ) AS total_weight_in_grams,

            COALESCE(
              (
                SELECT SUM(vi.total_amount)
                FROM valid_invoices vi
              ),
              0
            ) AS total_value
        `,
        {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }
      ),

      // OLD JEWEL:
      // Printed old jewel received from customer for selected date range.
      sequelize.query(
        `
          WITH valid_old_jewels AS (
            SELECT
              oj.id,
              oj.total_amount
            FROM old_jewels oj
            WHERE oj.deleted_at IS NULL
              AND oj.is_active = true
              AND oj.status = 'Printed'
              ${oldJewelBranchFilter}
              ${oldJewelDateFilter}
          )
          SELECT
            COALESCE(
              (
                SELECT SUM(COALESCE(oji.net_weight, 0))
                FROM old_jewel_items oji
                INNER JOIN valid_old_jewels voj
                  ON voj.id = oji.old_jewel_id
                WHERE oji.deleted_at IS NULL
              ),
              0
            ) AS total_weight_in_grams,

            COALESCE(
              (
                SELECT SUM(voj.total_amount)
                FROM valid_old_jewels voj
              ),
              0
            ) AS total_value
        `,
        {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }
      ),

      // PURCHASE:
      // GRN GST raised weight and value for selected date range.
      sequelize.query(
        `
          SELECT
            COALESCE(SUM(grn.total_gross_wt_in_g), 0) AS total_weight_in_grams,
            COALESCE(SUM(grn.total_amount), 0) AS total_value
          FROM grns grn
          WHERE grn.deleted_at IS NULL
            AND grn.is_active = true
            ${purchaseBranchFilter}
            ${purchaseDateFilter}
        `,
        {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }
      ),
      // COLLECTIONS:
      // Incoming Cash + UPI + Card receipts only.
      // Vendor payments are intentionally excluded.
      sequelize.query(
        `
          WITH collection_stream AS (

            /* Sales invoice and jewel-repair payments */
            SELECT
              COALESCE(sib.branch_id, jr.branch_id) AS branch_id,
              p.payment_date AS txn_date,
              p.payment_mode::text AS payment_mode,
              p.amount_received::numeric AS amount
            FROM payments p
            LEFT JOIN sales_invoice_bills sib
              ON sib.id = p.invoice_bill_id
              AND sib.deleted_at IS NULL
              AND sib.is_active = true
              AND sib.status = 'Invoice'
            LEFT JOIN jewel_repairs jr
              ON jr.id = p.jewel_repair_id
              AND jr.deleted_at IS NULL
              AND jr.is_active = true
              AND jr.status = 'Completed'
            WHERE p.deleted_at IS NULL
              AND p.status = 'Completed'
              AND (
                sib.id IS NOT NULL
                OR jr.id IS NOT NULL
              )

            UNION ALL

            /* Voucher receipts */
            SELECT
              vr.branch_id,
              vr.receipt_date AS txn_date,
              pm.payment_mode::text AS payment_mode,
              vr.amount::numeric AS amount
            FROM voucher_receipts vr
            INNER JOIN payment_modes pm
              ON pm.id = vr.payment_mode_id
            WHERE vr.deleted_at IS NULL
              AND vr.is_active = true

            UNION ALL

            /* Saving-scheme installment payments */
            SELECT
              c.branch_id,
              p.payment_date AS txn_date,
              p.payment_mode::text AS payment_mode,
              p.amount_received::numeric AS amount
            FROM customer_scheme_payments sp
            INNER JOIN customer_enrollments ce
              ON ce.id = sp.enrollment_id
              AND ce.deleted_at IS NULL
            INNER JOIN customers c
              ON c.id = ce.customer_id
              AND c.deleted_at IS NULL
            INNER JOIN payments p
              ON p.scheme_payment_id = sp.id
              AND p.deleted_at IS NULL
            WHERE sp.deleted_at IS NULL
              AND sp.payment_source = 'INSTALLMENT'
              AND p.status = 'Completed'
          )

          SELECT
            COALESCE(
              SUM(
                CASE WHEN cs.payment_mode = 'Cash'
                THEN cs.amount
                ELSE 0 END
              ),
              0
            ) AS cash_amount,

            COALESCE(
              SUM(
                CASE WHEN cs.payment_mode = 'UPI'
                THEN cs.amount
                ELSE 0 END
              ),
              0
            ) AS upi_amount,

            COALESCE(
              SUM(
                CASE WHEN cs.payment_mode = 'Card'
                THEN cs.amount
                ELSE 0 END
              ),
              0
            ) AS card_amount,

            COALESCE(SUM(cs.amount), 0) AS total_amount_collected
          FROM collection_stream cs
          WHERE 1 = 1
            ${collectionBranchFilter}
            ${collectionDateFilter}
        `,
        {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }
      ),
      // EXPENSES:
      // Vendor payments only, excluding Cash in Hand and HDFC ledgers.
      sequelize.query(
        `
          SELECT
            COALESCE(SUM(vp.amount), 0) AS total_expense_amount
          FROM vendor_payments vp
          LEFT JOIN ledger l
            ON l.id = vp.account_name_id
            AND l.deleted_at IS NULL
          WHERE vp.deleted_at IS NULL
            AND vp.is_active = true
            AND vp.status = 'Completed'
            ${expenseBranchFilter}
            ${expenseDateFilter}
            AND COALESCE(LOWER(TRIM(l.ledger_name)), '') NOT IN (
              'cash in hand',
              'hdfc',
              'hdfc bank'
            )
        `,
        {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }
      ),

      // TODAY'S SILVER PRICE
      sequelize.query(
        `
          SELECT mt.material_price
          FROM "materialTypes" mt
          WHERE mt.deleted_at IS NULL
            AND LOWER(TRIM(mt.material_type)) = 'silver'
            ${silverRateBranchFilter}
          ORDER BY mt.updated_at DESC
          LIMIT 1
        `,
        {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const capital = capitalRows[0] || {};
    const sales = salesRows[0] || {};
    const oldJewel = oldJewelRows[0] || {};
    const purchase = purchaseRows[0] || {};
    const collections = collectionRows[0] || {};
    const expenses = expenseRows[0] || {};
    const silverRate = silverRateRows[0] || {};

    const AVERAGE_LABOUR_COST = 100;

    // Capital stock
    const capitalStockWeight = Number(capital.total_weight_in_grams || 0);
    const capitalStockValue = Number(capital.total_value || 0);

    // Total stock = Capital + Purchase - Sales
    const purchaseStockWeight = Number(purchase.total_weight_in_grams || 0);
    const purchaseStockValue = Number(purchase.total_value || 0);

    const salesStockWeight = Number(sales.total_weight_in_grams || 0);

    const totalStockWeight = capitalStockWeight + purchaseStockWeight - salesStockWeight;

    // Total stock value
    const salesStockValue = Number(sales.total_value || 0);

    const totalStockValue = capitalStockValue + purchaseStockValue - salesStockValue;

    // Increase in stock = Total stock - Capital stock
    const increaseInStockWeight = totalStockWeight - capitalStockWeight;

    const increaseInStockValue = totalStockValue - capitalStockValue;

    // Average value per gram
    const totalWeightForAverage = capitalStockWeight + purchaseStockWeight;

    const averageValuePerGram = totalWeightForAverage > 0 ? (capitalStockValue + purchaseStockValue) / totalWeightForAverage : 0;

    // Old silver / old jewel weight
    const oldSilverWeight = Number(oldJewel.total_weight_in_grams || 0);

    // Profit from increase in stock
    const profitValue = increaseInStockWeight * averageValuePerGram;

    const totalCollectionAmount = Number(collections.total_amount_collected || 0);

    const totalExpenseAmount = Number(expenses.total_expense_amount || 0);

    // Expenses already exclude Cash in Hand / HDFC bank-deposit entries.
    const cashVsStockAmount = totalCollectionAmount - totalExpenseAmount;

    const silverRatePerGram = Number(silverRate.material_price || 0);

    const cashVsStockRatePerGram = silverRatePerGram + AVERAGE_LABOUR_COST;

    const cashVsStockWeightInGrams = cashVsStockRatePerGram > 0 ? cashVsStockAmount / cashVsStockRatePerGram : 0;


    return commonService.okResponse(res, {
      capital: {
        cutoff_date: "2026-01-26",
        total_weight_in_grams: capitalStockWeight,
        total_value: capitalStockValue,
      },

      sales: {
        total_weight_in_grams: Number(sales.total_weight_in_grams || 0),
        total_value: Number(sales.total_value || 0),
      },

      old_jewel: {
        total_weight_in_grams: oldSilverWeight,
        total_value: Number(oldJewel.total_value || 0),
      },

      purchase: {
        total_weight_in_grams: purchaseStockWeight,
        total_value: purchaseStockValue,
      },

      average_labour_cost_per_gram: AVERAGE_LABOUR_COST,

      increase_in_stock: { // total - capital = increase_in_stock
        total_stock_in_grams: totalStockWeight,
        total_stock_in_value: totalStockValue,
        capital_stock_in_grams: capitalStockWeight,
        capital_stock_in_value: capitalStockValue,
        total_weight_in_grams: increaseInStockWeight, 
        total_value: increaseInStockValue,
      },

      average_value_per_gram: Number(averageValuePerGram.toFixed(2)),

      profit: { // (Increase in stock * average value) + old silver weight
        profit_value: Number(profitValue.toFixed(2)),
        old_silver_weight_in_grams: oldSilverWeight,
      },

      collections: {
        cash_amount: Number(collections.cash_amount || 0),
        upi_amount: Number(collections.upi_amount || 0),
        card_amount: Number(collections.card_amount || 0),
        total_amount_collected: Number(collections.total_amount_collected || 0
        ),
      },

      expenses: {
        total_expense_amount: Number(
          expenses.total_expense_amount || 0
        ),
      },

      cash_vs_stock: {
        collection_amount: Number(totalCollectionAmount.toFixed(2)),
        payment_amount_excluding_cash_deposit: Number(totalExpenseAmount.toFixed(2)),
        total_value: Number(cashVsStockAmount.toFixed(2)),

        silver_rate_per_gram: Number(silverRatePerGram.toFixed(2)),
        average_labour_cost_per_gram: AVERAGE_LABOUR_COST,
        rate_per_gram: Number(cashVsStockRatePerGram.toFixed(2)),

        total_weight_in_grams: Number(cashVsStockWeightInGrams.toFixed(3)),
      },
    });
  } catch (error) {
    console.error("Get Profit Section Error:", error);
    return commonService.handleError(res, error);
  }
};




module.exports = {
  getSuperAdminDashboard,
  getStockKpiSummary,
  getSalesSummary,
  getProfitKPISummary,
  getProfitSection

};