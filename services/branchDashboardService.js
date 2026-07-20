const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { dateFilter } = require("../helpers/dateHelper");
const REPORT_CONFIG = require("../helpers/configs/reportConfig");
const salesManagementService = require("../services/salesManagementService");
const stockManagementService = require("../services/stockManagementService");

// Revenue, Revenue by group and KPI
const getDashboardScorecards = async (req, res) => {
    try {
        const {
            branch_id,
            from_date,
            to_date,
            date_filter
        } = req.query;

        const replacements = {};

        /* ---------------- BRANCH FILTER ---------------- */
        let branchCondition = "";

        if (branch_id) {
            branchCondition = ` AND t.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        // REVENUE
        const revenueDateFilter = dateFilter(
            { from_date, to_date, date_filter },
            "rs.txn_date",
            replacements
        );

        const revenueSql = `
            WITH revenue_stream AS (

                /* SALES + REPAIR */
                SELECT
                    COALESCE(sib.branch_id, jr.branch_id) AS branch_id,
                    p.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    CASE
                        WHEN sib.id IS NOT NULL
                            AND p.payment_mode = 'Cash'
                        THEN
                            p.amount_received
                            - COALESCE(sib.refund_amount, 0)
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

                UNION ALL

                /* RECEIPTS */
                SELECT
                    vr.branch_id,
                    vr.receipt_date,
                    pm.payment_mode,
                    vr.amount
                FROM voucher_receipts vr

                JOIN payment_modes pm
                    ON pm.id = vr.payment_mode_id

                WHERE vr.deleted_at IS NULL
                AND vr.is_active = true

                UNION ALL

                /* SCHEME */
                SELECT
                    c.branch_id,
                    sp.payment_date,
                    p.payment_mode::text,
                    p.amount_received
                FROM customer_scheme_payments sp

                JOIN customer_enrollments e
                    ON e.id = sp.enrollment_id
                    AND e.deleted_at IS NULL

                JOIN customers c
                    ON c.id = e.customer_id
                    AND c.deleted_at IS NULL

                JOIN payments p
                    ON p.scheme_payment_id = sp.id
                    AND p.deleted_at IS NULL

                WHERE sp.deleted_at IS NULL
                AND sp.payment_source = 'INSTALLMENT'
                AND p.status = 'Completed'

                UNION ALL

                /* VENDOR PAYMENT NEGATIVE */
                SELECT
                    vp.branch_id,
                    vp.payment_date,
                    pm.payment_mode,
                    -vp.amount
                FROM vendor_payments vp

                JOIN payment_modes pm
                    ON pm.id = vp.payment_mode

                WHERE vp.deleted_at IS NULL
                AND vp.is_active = true
                AND vp.status = 'Completed'
            )

            SELECT
                ROUND(SUM(CASE WHEN payment_mode='Cash' THEN amount ELSE 0 END),2) AS cash,
                ROUND(SUM(CASE WHEN payment_mode='UPI' THEN amount ELSE 0 END),2) AS upi,
                ROUND(SUM(CASE WHEN payment_mode='Card' THEN amount ELSE 0 END),2) AS card,
                ROUND(SUM(amount),2) AS total_collection

            FROM revenue_stream rs

            WHERE 1=1
            ${revenueDateFilter}
            ${branch_id ? "AND rs.branch_id = :branch_id" : ""}
        `;

        const [revenue] = await sequelize.query(revenueSql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // KPI SCORECARDS
        const kpi = {};

        for (const reportType of Object.keys(REPORT_CONFIG)) {

            const cfg = REPORT_CONFIG[reportType];

            const whereSql = `
                1=1
                ${dateFilter(
                    { from_date, to_date, date_filter },
                    cfg.dateColumn,
                    replacements
                )}
                ${branchCondition}
                ${cfg.statusCondition || ""}
            `;

            kpi[reportType] = await salesManagementService.getScorecardByType({
                config: cfg,
                whereSql,
                replacements
            });
        }

        // REVENUE BY GROUP
        const revenueByGroupSql = `
            SELECT
                'Sales' AS group_name,
                COALESCE(SUM(total_amount),0) AS amount
            FROM sales_invoice_bills t
            WHERE t.deleted_at IS NULL
            ${dateFilter(
                { from_date, to_date, date_filter },
                "t.created_at",
                replacements
            )}
            ${branchCondition}

            UNION ALL

            SELECT
                'Repair' AS group_name,
                COALESCE(SUM(total_amount),0) AS amount
            FROM jewel_repairs t
            WHERE t.deleted_at IS NULL
            ${dateFilter(
                { from_date, to_date, date_filter },
                "t.created_at",
                replacements
            )}
            ${branchCondition}

            UNION ALL

            SELECT
                'Scheme' AS group_name,
                COALESCE(SUM(paid_amount),0) AS amount
            FROM customer_scheme_payments t
            WHERE t.deleted_at IS NULL
            ${dateFilter(
                { from_date, to_date, date_filter },
                "t.payment_date",
                replacements
            )}
            ${branchCondition}
        `;

        const revenueByGroup = await sequelize.query(revenueByGroupSql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        return commonService.okResponse(res, {
            revenue: {
                total_collection: Number(revenue?.total_collection || 0),
                cash: Number(revenue?.cash || 0),
                upi: Number(revenue?.upi || 0),
                card: Number(revenue?.card || 0)
            },

            kpi,

            revenue_by_group: revenueByGroup
        });

    } catch (error) {
        console.error("Dashboard Scorecard Error:", error);
        return commonService.handleError(res, error);
    }
};

const getTopPerformanceDashboard = async (req, res) => {
    try {

        const {
            branch_id,
            from_date,
            to_date,
            date_filter,
            limit = 8
        } = req.query;

        const replacements = { limit: Number(limit) };

        let branchCondition = "";

        if (branch_id) {
            branchCondition = `AND sib.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        const dateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "sib.invoice_date",
            replacements
        );

        // TOP EMPLOYEE PERFORMER
        const employeeSql = `
            SELECT
                e.id,
                e.employee_no,
                e.employee_name,
                ROUND(COALESCE(SUM(sibi.gross_weight * (sibi.quantity - COALESCE(sibi.returned_quantity, 0))), 0), 3) AS total_weight,
                COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0) AS sales_amount,
                COUNT(DISTINCT sib.id) AS total_bills

            FROM sales_invoice_bills sib
            JOIN employees e ON e.id = sib.employee_id AND e.deleted_at IS NULL
            JOIN sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.deleted_at IS NULL

            WHERE sib.deleted_at IS NULL AND sib.status ='Invoice'
              ${branchCondition}
              ${dateCondition}

            GROUP BY
                e.id,
                e.employee_no,
                e.employee_name

            ORDER BY sales_amount DESC
            LIMIT :limit
        `;

        const top_employee_performer = await sequelize.query(employeeSql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        // TOP SELLING CATEGORY
        const categorySql = `
            SELECT
                c.id,
                c.category_name,
                c.category_image_url,
                COUNT(sibi.id) AS total_count,
                COALESCE(SUM(sibi.quantity - COALESCE(sibi.returned_quantity, 0)), 0) AS total_quantity,
                COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0) AS sales_amount

            FROM sales_invoice_bills sib
            JOIN sales_invoice_bill_items sibi ON sibi.invoice_bill_id = sib.id AND sibi.deleted_at IS NULL
            JOIN products p ON p.id = sibi.product_id AND p.deleted_at IS NULL
            JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL

            WHERE sib.deleted_at IS NULL AND sib.status ='Invoice'

              ${branchCondition}
              ${dateCondition}

            GROUP BY
                c.id,
                c.category_name,
                c.category_image_url

            ORDER BY total_quantity DESC
            LIMIT :limit
        `;

        const top_selling_category = await sequelize.query(categorySql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        const top_buying_customers =
            await salesManagementService.getTopBuyingCustomersData({
                branch_id,
                from_date,
                to_date,
                date_filter,
                limit
            });

        return commonService.okResponse(res, {
            top_employee_performer,
            top_selling_category,
            top_buying_customers
        });

    } catch (error) {
        console.error("Top Performance Dashboard Error:", error);
        return commonService.handleError(res, error);
    }
};

const getBranchDashboardStockDetails = async (req, res) => {
  try {

    const { branch_id, from_date, to_date, date_filter, page, limit } = req.query;

    const replacements = {};
    let where = ` WHERE p.deleted_at IS NULL AND p.status = 'Active'`;

    if (branch_id) {
      where += ` AND p.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    where += dateFilter(
      { from_date, to_date, date_filter },
      "p.created_at",
      replacements
    );

    const usePagination = page || limit;
    const pageNum = parseInt(page || 1, 10);
    const limitNum = parseInt(limit || 10, 10);
    const offset = (pageNum - 1) * limitNum;

    const result = await stockManagementService.getLowStockList(
      where,
      replacements,
      usePagination,
      limitNum,
      offset
    );

    const stockInHand = await stockManagementService.getStockInHandSummary(
        where,
        replacements
    );

    // Stock Received via stock transfer
     const stockTransferReplacements = {};

    let transferWhere = `
      WHERE st.deleted_at IS NULL
    `;

    if (branch_id) {
      transferWhere += ` AND st.branch_to = :branch_id `;
      stockTransferReplacements.branch_id = branch_id;
    }

    transferWhere += dateFilter(
      { from_date, to_date, date_filter },
      "st.date",
      stockTransferReplacements
    );

    const stockReceivedQuery = `
      SELECT
        ROUND(COALESCE(SUM(sti.weight), 0), 2) AS total_weight,
        COALESCE(SUM(sti.transfer_quantity), 0) AS total_quantity,
        COUNT(DISTINCT sti.transferred_product_id) AS product_count
      FROM stock_transfers st
      JOIN stock_transfer_items sti ON sti.stock_transfer_id = st.id AND sti.deleted_at IS NULL
      ${transferWhere}
    `;

    const [stockReceived] = await sequelize.query(
      stockReceivedQuery,
      {
        replacements: stockTransferReplacements,
        type: sequelize.QueryTypes.SELECT
      }
    );

    return commonService.okResponse(res, {    
      stock_in_hand: stockInHand,
       stock_received: {
        total_weight: Number(stockReceived.total_weight || 0),
        total_quantity: Number(stockReceived.total_quantity || 0),
        product_count: Number(stockReceived.product_count || 0)
      },
      rows: result.rows
    });

  } catch (error) {
    console.error("Branch Dashboard Low Stock Error:", error);
    return commonService.handleError(res, error);
  }
};

module.exports={
    getDashboardScorecards,
    getTopPerformanceDashboard,
    getBranchDashboardStockDetails
}