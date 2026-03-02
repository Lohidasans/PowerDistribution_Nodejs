const { sequelize } = require("../models/index");
const commonService = require("./commonService");
const { dateFilter } = require("../helpers/dateHelper");

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
            COALESCE(SUM(i.quantity), 0)      AS total_quantity,
            COALESCE(SUM(i.gross_weight), 0)  AS total_gross_weight,
            COALESCE(SUM(i.net_weight), 0)    AS total_net_weight
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
    // 2. STOCK KPI
    // ============================================================
    const stockKpiRep = {};
    if (branch_id) stockKpiRep.sk_branch = branch_id;

 const grnPurchaseQuery = `
  SELECT
    COALESCE(SUM(gi.total_amount), 0)      AS total_amount,
    COALESCE(SUM(gi.quantity), 0)::int     AS total_quantity,
    COALESCE(SUM(gi.net_wt_in_g), 0)       AS total_weight
  FROM "grnItems" gi
  JOIN grns g
    ON g.id = gi.grn_id
   AND g.deleted_at IS NULL
  WHERE gi.deleted_at IS NULL
  ${branch_id ? `AND g.branch_id = :sk_branch` : ``}
`;

const totalStockQuery = `
  SELECT
    COALESCE(SUM(pid.quantity),0)::int AS total_quantity,
    COALESCE(SUM(pid.quantity * pid.net_weight),0) AS total_weight,
    COALESCE(SUM(
      pid.quantity * (
        (COALESCE(pid.rate_per_gram,0) * COALESCE(pid.net_weight,0)) +
        COALESCE(pid.making_charge,0) +
        COALESCE(pid.wastage,0) +
        COALESCE(pid.stone_value,0)
      )
    ),0) AS total_amount
  FROM products p
  JOIN "productItemDetails" pid
    ON pid.product_id = p.id
   AND pid.deleted_at IS NULL
   AND pid.quantity > 0
  WHERE p.deleted_at IS NULL
    AND p.status = 'Active'
    ${branch_id ? `AND p.branch_id = :sk_branch` : ``}
`;
const grnUpdatedQuery = `
  SELECT
    COALESCE(SUM(gi.total_amount), 0)      AS total_amount,
    COALESCE(SUM(gi.quantity), 0)::int     AS total_quantity,
    COALESCE(SUM(gi.net_wt_in_g), 0)       AS total_weight
  FROM grns g
  JOIN "grnItems" gi
    ON gi.grn_id = g.id
   AND gi.deleted_at IS NULL
  WHERE g.deleted_at IS NULL
    AND g.status_id = 2
  ${branch_id ? `AND g.branch_id = :sk_branch` : ``}
`;

const grnPendingQuery = `
  SELECT
    COALESCE(SUM(gi.total_amount), 0)      AS total_amount,
    COALESCE(SUM(gi.quantity), 0)::int     AS total_quantity,
    COALESCE(SUM(gi.net_wt_in_g), 0)       AS total_weight
  FROM grns g
  JOIN "grnItems" gi
    ON gi.grn_id = g.id
   AND gi.deleted_at IS NULL
  WHERE g.deleted_at IS NULL
    AND g.status_id = 1
  ${branch_id ? `AND g.branch_id = :sk_branch` : ``}
`;

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
    // 4. PROFIT KPI – unchanged
    // ============================================================
    const profitRep = {};
    const profitBranch = branch_id ? `AND sib.branch_id = :profit_branch` : "";
    if (branch_id) profitRep.profit_branch = branch_id;
    const profitDateCond = buildDateCondition(
      dateOpts,
      "sib.invoice_date",
      profitRep,
      "_profit"
    );

const profitKpiQuery = `
  WITH sold_out_products AS (
    SELECT
      p.id AS product_id,
      p.ref_no_id
    FROM products p
    JOIN "productItemDetails" pid
      ON pid.product_id = p.id
     AND pid.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
    GROUP BY p.id, p.ref_no_id
    HAVING
      COALESCE(SUM(pid.quantity), 0) = 0
      AND COUNT(*) FILTER (
        WHERE pid.stock_out_reason = 'SOLD'
      ) > 0
  ),
  sales_values AS (
    SELECT
      sibi.product_id,
      SUM(sibi.amount) AS selling_amount
    FROM sales_invoice_bill_items sibi
    JOIN sales_invoice_bills sib
      ON sib.id = sibi.invoice_bill_id
     AND sib.deleted_at IS NULL
     AND sib.is_active = true
     AND sib.status = 'Invoice'
     ${profitBranch}
     ${profitDateCond}
    WHERE sibi.deleted_at IS NULL
    GROUP BY sibi.product_id
  ),
  purchase_values AS (
    SELECT
      gi.id AS ref_no_id,
      COALESCE(SUM(gi.total_amount), 0) AS purchase_cost
    FROM "grnItems" gi
    JOIN grns g
      ON g.id = gi.grn_id
     AND g.deleted_at IS NULL
    WHERE gi.deleted_at IS NULL
    GROUP BY gi.id
  )
  SELECT
    COALESCE(SUM(sv.selling_amount), 0) AS total_sales,
    COALESCE(SUM(pv.purchase_cost), 0)  AS total_purchase,
    COALESCE(SUM(sv.selling_amount), 0) - COALESCE(SUM(pv.purchase_cost), 0) AS total_profit
  FROM sold_out_products sop
  -- must have sales (otherwise it was SOLD but no invoice in filter)
  JOIN sales_values sv
    ON sv.product_id = sop.product_id
  -- purchase from grnItems using ref_no_id mapping
  LEFT JOIN purchase_values pv
    ON pv.ref_no_id = sop.ref_no_id
`;

    // ============================================================
    // 5. AMOUNT COLLECTION – UPDATED (REFUND DEDUCT like branch-wise-report)
    //    - deduct SUM(DISTINCT sib.refund_amount) from cash + total
    // ============================================================
    const collRep = {};
    const collDateCond = buildDateCondition(dateOpts, "p.payment_date", collRep, "_coll");
    const collBranch = branch_id
      ? `AND COALESCE(sib.branch_id, jr.branch_id) = :coll_branch`
      : "";
    if (branch_id) collRep.coll_branch = branch_id;

    const amountCollectionQuery = `
      WITH refund_sum AS (
        SELECT
          COALESCE(SUM(DISTINCT sib_inner.refund_amount), 0) AS refund_amount
        FROM payments p_inner
        LEFT JOIN sales_invoice_bills sib_inner
          ON sib_inner.id = p_inner.invoice_bill_id
          AND sib_inner.deleted_at IS NULL AND sib_inner.is_active = true
        LEFT JOIN jewel_repairs jr_inner
          ON jr_inner.id = p_inner.jewel_repair_id
          AND jr_inner.deleted_at IS NULL AND jr_inner.is_active = true
        WHERE p_inner.deleted_at IS NULL
          AND p_inner.status = 'Completed'
          AND sib_inner.id IS NOT NULL
          ${collDateCond.replace(/p\./g, "p_inner.")}
          ${collBranch
            .replace(/sib\./g, "sib_inner.")
            .replace(/jr\./g, "jr_inner.")}
      )
      SELECT
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Cash'          THEN p.amount_received ELSE 0 END), 0)
          - (SELECT refund_amount FROM refund_sum) AS cash,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'UPI'           THEN p.amount_received ELSE 0 END), 0) AS upi,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Card'          THEN p.amount_received ELSE 0 END), 0) AS card,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Bank Transfer' THEN p.amount_received ELSE 0 END), 0) AS bank_transfer,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Cheque'        THEN p.amount_received ELSE 0 END), 0) AS cheque,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Other'         THEN p.amount_received ELSE 0 END), 0) AS other,
        COALESCE(SUM(p.amount_received), 0)
          - (SELECT refund_amount FROM refund_sum) AS total
      FROM payments p
      LEFT JOIN sales_invoice_bills sib
        ON sib.id = p.invoice_bill_id AND sib.deleted_at IS NULL AND sib.is_active = true
      LEFT JOIN jewel_repairs jr
        ON jr.id = p.jewel_repair_id AND jr.deleted_at IS NULL and jr.is_active = true
      WHERE p.deleted_at IS NULL
        AND p.status = 'Completed'
        ${collDateCond}
        ${collBranch}
    `;

    // ============================================================
    // 6. JEWEL ACTIVITY KPI
    // ============================================================
    const jewRep = {};
    const jewDateCond = buildDateCondition(
      dateOpts,
      "sr.return_date",
      jewRep,
      "_jew"
    );
    const jewBranch = branch_id ? `AND sr.branch_id = :jew_branch` : "";
    if (branch_id) jewRep.jew_branch = branch_id;

    const salesReturnQuery = `
      SELECT
        COUNT(DISTINCT sr.id)::int                  AS bill_count,
        COALESCE(SUM(sr.total_quantity), 0)         AS total_quantity,
        COALESCE(SUM(sri.gross_weight::numeric), 0) AS total_gross_weight,
        COALESCE(SUM(sri.net_weight::numeric), 0)   AS total_net_weight,
        COALESCE(SUM(sr.total_amount), 0)           AS total_amount
      FROM sales_returns sr
      LEFT JOIN sales_return_items sri
        ON sri.sales_return_id = sr.id AND sri.deleted_at IS NULL
      WHERE sr.deleted_at IS NULL AND sr.is_active = true
        AND sr.status NOT IN ('Cancelled')
        ${jewDateCond}
        ${jewBranch}
    `;

    const ojRep = {};
    const ojDateCond = buildDateCondition(dateOpts, "oj.date", ojRep, "_oj");
    const ojBranch = branch_id ? `AND oj.branch_id = :oj_branch` : "";
    if (branch_id) ojRep.oj_branch = branch_id;

    const oldJewelQuery = `
      SELECT
        COUNT(DISTINCT oj.id)::int        AS bill_count,
        COUNT(oji.id)::int                AS total_quantity,
        COALESCE(SUM(oji.net_weight), 0)  AS total_weight,
        COALESCE(SUM(oj.total_amount), 0) AS total_amount
      FROM old_jewels oj
      LEFT JOIN old_jewel_items oji
        ON oji.old_jewel_id = oj.id AND oji.deleted_at IS NULL
      WHERE oj.deleted_at IS NULL AND oj.is_active = true
        AND oj.status NOT IN ('Cancelled')
        ${ojDateCond}
        ${ojBranch}
    `;

    const jrRep = {};
    const jrDateCond = buildDateCondition(dateOpts, "jr.date", jrRep, "_jr");
    const jrBranch = branch_id ? `AND jr.branch_id = :jr_branch` : "";
    if (branch_id) jrRep.jr_branch = branch_id;

    const jewelRepairQuery = `
      SELECT
        COUNT(DISTINCT jr.id)::int        AS bill_count,
        COALESCE(SUM(jri.quantity), 0)    AS total_quantity,
        COALESCE(SUM(jri.weight), 0)      AS total_weight,
        COALESCE(SUM(jr.total_amount), 0) AS total_amount
      FROM jewel_repairs jr
      LEFT JOIN jewel_repair_items jri
        ON jri.repair_id = jr.id AND jri.deleted_at IS NULL
      WHERE jr.deleted_at IS NULL AND jr.is_active = true
        AND jr.status NOT IN ('Cancelled')
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
        COALESCE(SUM(g.total_amount), 0) AS total_purchase
      FROM grns g
      WHERE g.deleted_at IS NULL
    `;

    const vendorPaidQuery = `
      SELECT
        COALESCE(SUM(vp.amount), 0) AS total_paid
      FROM vendor_payments vp
      WHERE vp.deleted_at IS NULL
        AND vp.bill_type_id = 1
        AND vp.user_type_id = 1
        AND vp.is_active = true
        AND vp.status = 'Completed'
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
        GROUP BY g.vendor_id
      ),
      vendor_sales AS (
        SELECT
          p.vendor_id,
          COALESCE(SUM(sibi.amount), 0)        AS sales_amount,
          COALESCE(SUM(sibi.quantity), 0)::int AS sales_qty,
          COALESCE(SUM(sibi.net_weight), 0)    AS sales_weight
        FROM sales_invoice_bill_items sibi
        JOIN products p
          ON p.id = sibi.product_id AND p.deleted_at IS NULL
        JOIN sales_invoice_bills sib
          ON sib.id = sibi.invoice_bill_id
          AND sib.deleted_at IS NULL AND sib.is_active = true
          AND sib.status NOT IN ('Draft', 'Cancelled')
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
      [grnPurchaseResult],
      [totalStockResult],
      [grnUpdatedResult],
      [grnPendingResult],
      statisticsResult,
      [profitResult],
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
      sequelize.query(grnPurchaseQuery, {
        replacements: stockKpiRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(totalStockQuery, {
        replacements: stockKpiRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(grnUpdatedQuery, {
        replacements: stockKpiRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(grnPendingQuery, {
        replacements: stockKpiRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(statisticsQuery, {
        replacements: statsRep,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(profitKpiQuery, {
        replacements: profitRep,
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
    const totalPaid = money(vendorPaidResult?.total_paid);

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

      stock_kpi: {
     total_purchase: {
  total_amount: money(grnPurchaseResult?.total_amount),
  total_quantity: int(grnPurchaseResult?.total_quantity),
  total_weight: Number(Number(grnPurchaseResult?.total_weight || 0).toFixed(3)),
},
total_stock: {
  total_amount: money(totalStockResult?.total_amount),   // ✅ must exist
  total_quantity: int(totalStockResult?.total_quantity),
  total_weight: Number(Number(totalStockResult?.total_weight || 0).toFixed(3)),
},
       updated: {
  total_amount: money(grnUpdatedResult?.total_amount),
  total_quantity: int(grnUpdatedResult?.total_quantity),
  total_weight: Number(Number(grnUpdatedResult?.total_weight || 0).toFixed(3)),
},
yet_to_update: {
  total_amount: money(grnPendingResult?.total_amount),
  total_quantity: int(grnPendingResult?.total_quantity),
  total_weight: Number(Number(grnPendingResult?.total_weight || 0).toFixed(3)),
},
      },

      statistics: (statisticsResult || []).map((r) => ({
        month_key: r.month_key,
        month_label: r.month_label,
        sales: money(r.sales),
        purchase: money(r.purchase),
        profit: money(r.profit),
      })),

      profit_kpi: {
        total_sales: money(profitResult?.total_sales),
        total_purchase: money(profitResult?.total_purchase),
        total_profit: money(profitResult?.total_profit),
      },

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
        total_paid: totalPaid,
        outstanding_payable: money(totalPurchase - totalPaid),
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
                * COALESCE(sibi.quantity, 1)
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
              AND sibi.is_returned = false
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
    if (branch_id) replacements.branch_id = branch_id;

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
       SOURCE OF TRUTH (SAME AS getAllGrns)
       ===================================================== */
    const grnWeightsCTE = `
      WITH grn_weights AS (
        SELECT
          g.id AS grn_id,
          p.branch_id,

          -- ORDERED WEIGHT (from GRN items)
          COALESCE(SUM(DISTINCT gi.net_wt_in_g), 0) AS ordered_weight,

          -- UPDATED WEIGHT (from product items)
          COALESCE(SUM(pid.net_weight), 0) AS updated_weight

        FROM grns g
        JOIN "grnItems" gi
          ON gi.grn_id = g.id
         AND gi.deleted_at IS NULL

        JOIN products p
          ON p.grn_id = g.id
         AND p.deleted_at IS NULL

        LEFT JOIN "productItemDetails" pid
          ON pid.product_id = p.id
         AND pid.deleted_at IS NULL

        WHERE g.deleted_at IS NULL
          ${branch_id ? `AND p.branch_id = :branch_id` : ``}
          ${grnDateCondition}

        GROUP BY g.id, p.branch_id
      )
    `;

    /* =====================================================
       1. TOTAL PURCHASE (ORDERED)
       ===================================================== */
    const totalPurchaseQuery = `
      ${grnWeightsCTE}
      SELECT
        COUNT(*)::int AS total_quantity,
        COALESCE(SUM(ordered_weight), 0) AS total_weight
      FROM grn_weights
    `;

    /* =====================================================
       2. UPDATED (ORDERED ≈ UPDATED)
       ===================================================== */
    const updatedQuery = `
      ${grnWeightsCTE}
      SELECT
        COUNT(*)::int AS total_quantity,
        COALESCE(SUM(ordered_weight), 0) AS total_weight
      FROM grn_weights
      WHERE (ordered_weight - updated_weight) <= 0.001
    `;

    /* =====================================================
       3. YET TO UPDATE (ORDERED > UPDATED)
       ===================================================== */
    const pendingQuery = `
      ${grnWeightsCTE}
      SELECT
        COUNT(*)::int AS total_quantity,
        COALESCE(SUM(ordered_weight - updated_weight), 0) AS total_weight
      FROM grn_weights
      WHERE (ordered_weight - updated_weight) > 0.001
    `;

    /* =====================================================
       4. TOTAL STOCK (CURRENT INVENTORY)
       ===================================================== */
    const totalStockQuery = `
      SELECT
        COALESCE(SUM(pid.quantity), 0)::int AS total_quantity,
        COALESCE(SUM(pid.quantity * pid.net_weight), 0) AS total_weight,
        COALESCE(SUM(
          pid.quantity * (
            (COALESCE(pid.rate_per_gram, 0) * COALESCE(pid.net_weight, 0)) +
            COALESCE(pid.making_charge, 0) +
            COALESCE(pid.wastage, 0) +
            COALESCE(pid.stone_value, 0)
          )
        ), 0) AS total_amount
      FROM products p
      JOIN "productItemDetails" pid
        ON pid.product_id = p.id
       AND pid.deleted_at IS NULL
       AND pid.quantity > 0
      WHERE p.deleted_at IS NULL
        AND p.status = 'Active'
        ${branch_id ? `AND p.branch_id = :branch_id` : ``}
    `;

    /* =====================================================
       EXECUTION
       ===================================================== */
    const [
      [purchaseResult],
      [updatedResult],
      [pendingResult],
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
      sequelize.query(pendingQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(totalStockQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    /* =====================================================
       RESPONSE (MATCHES UI)
       ===================================================== */
    return commonService.okResponse(res, {
      filters_applied: {
        branch_id: branch_id || null,
        date_filter: date_filter || null,
        from_date: normalizedFromDate || null,
        to_date: normalizedToDate || null,
      },
      data: {
        total_purchase: {
          total_quantity: int(purchaseResult?.total_quantity),
          total_weight: Number(
            Number(purchaseResult?.total_weight || 0).toFixed(3)
          ),
        },
        updated: {
          total_quantity: int(updatedResult?.total_quantity),
          total_weight: Number(
            Number(updatedResult?.total_weight || 0).toFixed(3)
          ),
        },
        yet_to_update: {
          total_quantity: int(pendingResult?.total_quantity),
          total_weight: Number(
            Number(pendingResult?.total_weight || 0).toFixed(3)
          ),
        },
        total_stock: {
          total_quantity: int(totalStockResult?.total_quantity),
          total_weight: Number(
            Number(totalStockResult?.total_weight || 0).toFixed(3)
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
module.exports = {
  getSuperAdminDashboard,
  getStockKpiSummary,
  getSalesSummary,
  getProfitKPISummary,

};