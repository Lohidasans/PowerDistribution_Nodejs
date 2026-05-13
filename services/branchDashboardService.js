const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { dateFilter } = require("../helpers/dateHelper");
const REPORT_CONFIG = require("../helpers/configs/reportConfig");
const salesManagementService = require("../services/salesManagementService");

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

                /* SALES */
                SELECT
                    sib.branch_id,
                    p.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    p.amount_received AS amount
                FROM payments p
                JOIN sales_invoice_bills sib
                    ON sib.id = p.invoice_bill_id
                WHERE p.deleted_at IS NULL
                  AND p.status = 'Completed'
                  AND sib.deleted_at IS NULL

                UNION ALL

                /* REPAIR */
                SELECT
                    jr.branch_id,
                    p.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    p.amount_received AS amount
                FROM payments p
                JOIN jewel_repairs jr
                    ON jr.id = p.jewel_repair_id
                WHERE p.deleted_at IS NULL
                  AND p.status = 'Completed'
                  AND jr.deleted_at IS NULL

                UNION ALL

                /* SCHEME */
                SELECT
                    c.branch_id,
                    sp.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    p.amount_received AS amount
                FROM customer_scheme_payments sp
                JOIN payments p
                    ON p.scheme_payment_id = sp.id
                JOIN customer_enrollments e
                    ON e.id = sp.enrollment_id
                JOIN customers c
                    ON c.id = e.customer_id
                WHERE sp.deleted_at IS NULL
                  AND p.deleted_at IS NULL
                  AND p.status = 'Completed'
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


module.exports={
    getDashboardScorecards
}