const { Op } = require('sequelize');
const commonService = require('./commonService');
const { sequelize } = require('../models/index');
const { dateFilter } = require("../helpers/dateHelper");

const getBranchwiseRevenue = async (req, res) => {
    try {
        const {
            branch_id,
            from_date,
            to_date,
            date_filter,
            page,
            limit,
            search, 
            payment_mode
        } = req.query;

        const replacements = {};
        const dateReplacements = {};

        const paymentDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "p.payment_date::date",
            dateReplacements
        );

        let branchCondition = "";
        if (branch_id) {
            branchCondition = `AND b.id = :branch_id`;
            replacements.branch_id = branch_id;
            dateReplacements.branch_id = branch_id;
        }

        let searchCondition = "";
        if (search) {
            searchCondition = `AND b.branch_name ILIKE :search`;
            replacements.search = `%${search}%`;
            dateReplacements.search = `%${search}%`;
        }

        let paymentModeCondition = "";
        if (payment_mode) {
            paymentModeCondition = `AND p.payment_mode = :payment_mode`;
            replacements.payment_mode = payment_mode;
            dateReplacements.payment_mode = payment_mode;
        }

        const hasPagination = page && limit;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (Number(page) - 1) * limitNum : null;

        let query = `
        SELECT
            b.id AS branch_id,
            b.branch_name,

            COALESCE(SUM(CASE WHEN p.payment_mode = 'Cash' THEN p.amount_received ELSE 0 END),0) AS cash,
            COALESCE(SUM(CASE WHEN p.payment_mode = 'UPI' THEN p.amount_received ELSE 0 END),0) AS upi,
            COALESCE(SUM(CASE WHEN p.payment_mode = 'Card' THEN p.amount_received ELSE 0 END),0) AS card,

            COALESCE(SUM(p.amount_received),0) AS total_amount

        FROM payments p
        LEFT JOIN sales_invoice_bills sib ON sib.id = p.invoice_bill_id AND sib.deleted_at IS NULL
        LEFT JOIN jewel_repairs jr ON jr.id = p.jewel_repair_id AND jr.deleted_at IS NULL
        INNER JOIN branches b ON b.id = COALESCE(sib.branch_id, jr.branch_id)

        WHERE p.deleted_at IS NULL AND p.status = 'Completed'
            ${paymentDateCondition}
            ${branchCondition}
            ${searchCondition}
            ${paymentModeCondition}
        GROUP BY b.id, b.branch_name
        ORDER BY total_amount DESC
        `;

        if (hasPagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            dateReplacements.limit = limitNum;
            dateReplacements.offset = offset;
        }

        const rows = await sequelize.query(query, {
            replacements: { ...dateReplacements, ...replacements },
            type: sequelize.QueryTypes.SELECT
        });

        const summary = rows.reduce(
            (acc, r) => {
                acc.total_collection += Number(r.total_amount);
                acc.cash += Number(r.cash);
                acc.upi += Number(r.upi);
                acc.card += Number(r.card);
                return acc;
            },
            {
                total_collection: 0,
                cash: 0,
                upi: 0,
                card: 0
            }
        );
        let totalItems = rows.length;

        if (hasPagination) {
            const [{ count }] = await sequelize.query(
                `
        SELECT COUNT(DISTINCT b.id)::int AS count
        FROM payments p
        LEFT JOIN sales_invoice_bills sib
          ON sib.id = p.invoice_bill_id
          AND sib.deleted_at IS NULL
        LEFT JOIN jewel_repairs jr
          ON jr.id = p.jewel_repair_id
          AND jr.deleted_at IS NULL
        LEFT JOIN branches b
          ON b.id = COALESCE(sib.branch_id, jr.branch_id)
        WHERE p.deleted_at IS NULL
          AND p.status = 'Completed'
          ${paymentDateCondition}
          ${branchCondition}
          ${searchCondition} `,
                {
                    replacements: { ...dateReplacements, ...replacements },
                    type: sequelize.QueryTypes.SELECT
                }
            );
            totalItems = count;
        }

        return commonService.okResponse(res, {
                summary: {
                    total_collection: summary.total_collection,
                    cash: summary.cash,
                    upi: summary.upi,
                    card: summary.card
                },
                totalItems,
                rows
        });

    } catch (error) {
        console.error("getBranchwiseRevenue Error:", error);
        return commonService.handleError(res, error);
    }
};

// helper for safe money math
const money = (v) => Number(Number(v || 0).toFixed(2));

const getBranchRevenueDetails = async (req, res) => {
    try {
        const money = (v) => Number(Number(v || 0).toFixed(2));
        const {
            branch_id,
            from_date,
            to_date,
            date_filter,
            search,
            page,
            limit,
            payment_mode
        } = req.query;

        if (!branch_id) {
            return commonService.badRequest(res, "branch_id is required");
        }

        const replacements = { branch_id };

        // DATE FILTER
        const paymentDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "p.payment_date::date",
            replacements
        );

        // SEARCH FILTER
        let searchCondition = "";
        if (search) {
            searchCondition = `
                AND (
                    sib.invoice_no ILIKE :search
                    OR jr.repair_code ILIKE :search
                )
            `;
            replacements.search = `%${search}%`;
        }

        let paymentModeCondition = "";
        if (payment_mode) {
            paymentModeCondition = `AND p.payment_mode = :payment_mode`;
            replacements.payment_mode = payment_mode;
        }


        const hasPagination = page && limit;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (Number(page) - 1) * limitNum : null;

        let query = `
            SELECT
                COALESCE(sib.invoice_no, jr.repair_code) AS description,
                COALESCE(SUM(CASE WHEN sib.id IS NOT NULL THEN sib.refund_amount ELSE 0 END), 0) AS refund,

                ROUND(SUM(CASE WHEN p.payment_mode = 'Cash' THEN p.amount_received ELSE 0 END), 2) AS cash,
                ROUND(SUM(CASE WHEN p.payment_mode = 'UPI' THEN p.amount_received ELSE 0 END), 2) AS upi,
                ROUND(SUM(CASE WHEN p.payment_mode = 'Card' THEN p.amount_received ELSE 0 END), 2) AS card,

                ROUND(SUM(p.amount_received), 2) AS total_amount,

                p.id AS payment_id,
                p.created_at AS payment_date

            FROM payments p

            LEFT JOIN sales_invoice_bills sib
                ON sib.id = p.invoice_bill_id
                AND sib.deleted_at IS NULL

            LEFT JOIN jewel_repairs jr
                ON jr.id = p.jewel_repair_id
                AND jr.deleted_at IS NULL

            WHERE p.deleted_at IS NULL
                AND p.status = 'Completed'
                AND COALESCE(sib.branch_id, jr.branch_id) = :branch_id
                ${paymentDateCondition}
                ${searchCondition}
                 ${paymentModeCondition}  

            GROUP BY description, p.id
            ORDER BY total_amount DESC
        `;

        if (hasPagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const rows = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        const summary = rows.reduce(
            (acc, r) => {
                acc.total_collection = money(acc.total_collection + Number(r.total_amount));
                acc.cash = money(acc.cash + Number(r.cash));
                acc.upi = money(acc.upi + Number(r.upi));
                acc.card = money(acc.card + Number(r.card));
                return acc;
            },
            {
                total_collection: 0,
                cash: 0,
                upi: 0,
                card: 0
            }
        );

        let totalItems = rows.length;

        if (hasPagination) {
            const [{ count }] = await sequelize.query(
                `
                SELECT COUNT(DISTINCT COALESCE(sib.invoice_no, jr.repair_code))::int AS count
                FROM payments p
                LEFT JOIN sales_invoice_bills sib
                    ON sib.id = p.invoice_bill_id
                    AND sib.deleted_at IS NULL
                LEFT JOIN jewel_repairs jr
                    ON jr.id = p.jewel_repair_id
                    AND jr.deleted_at IS NULL
                WHERE p.deleted_at IS NULL
                    AND p.status = 'Completed'
                    AND COALESCE(sib.branch_id, jr.branch_id) = :branch_id
                    ${paymentDateCondition}
                    ${searchCondition}
                `,
                {
                    replacements,
                    type: sequelize.QueryTypes.SELECT
                }
            );
            totalItems = count;
        }

        return commonService.okResponse(res, {
            data: {
                summary,
                totalItems,
                rows
            }
        });

    } catch (error) {
        console.error("getBranchRevenueDetails Error:", error);
        return commonService.handleError(res, error);
    }
}
module.exports = {
    getBranchwiseRevenue,
    getBranchRevenueDetails
};