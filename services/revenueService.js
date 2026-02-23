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

        // DATE FILTER
        const paymentDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "p.payment_date",
            dateReplacements
        );

        // BRANCH FILTER
        let branchCondition = "";
        if (branch_id) {
            branchCondition = `AND b.id = :branch_id`;
            replacements.branch_id = branch_id;
            dateReplacements.branch_id = branch_id;
        }

        // SEARCH FILTER
        let searchCondition = "";
        if (search) {
            searchCondition = `AND b.branch_name ILIKE :search`;
            replacements.search = `%${search}%`;
            dateReplacements.search = `%${search}%`;
        }

        // PAYMENT MODE FILTER — ONLY FOR TABLE ROWS
        let paymentModeConditionForRows = "";
        if (payment_mode) {
            paymentModeConditionForRows = `AND p.payment_mode = :payment_mode`;
            replacements.payment_mode = payment_mode;
            dateReplacements.payment_mode = payment_mode;
        }

        // Refund deduction logic: Refunds are cash transactions
        // Deduct from total and cash, but not from UPI/Card
        // Only skip deduction if explicitly filtering by UPI or Card
        const shouldDeductRefunds = !payment_mode || payment_mode === 'Cash';

        const hasPagination = page && limit;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (Number(page) - 1) * limitNum : null;

        // ===============================
        // 1️⃣ TABLE ROWS QUERY (WITH payment_mode)
        // ===============================
        const rowRefundDeduction = shouldDeductRefunds 
            ? '- COALESCE(SUM(DISTINCT sib.refund_amount), 0)' 
            : '';

        let rowsQuery = `
      SELECT
        b.id AS branch_id,
        b.branch_name,

        COALESCE(SUM(CASE WHEN p.payment_mode = 'Cash' THEN p.amount_received ELSE 0 END),0) ${rowRefundDeduction} AS cash,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'UPI' THEN p.amount_received ELSE 0 END),0) AS upi,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Card' THEN p.amount_received ELSE 0 END),0) AS card,

        COALESCE(SUM(p.amount_received),0) ${rowRefundDeduction} AS total_amount

      FROM payments p
      LEFT JOIN sales_invoice_bills sib
        ON sib.id = p.invoice_bill_id
        AND sib.deleted_at IS NULL
      LEFT JOIN jewel_repairs jr
        ON jr.id = p.jewel_repair_id
        AND jr.deleted_at IS NULL
      INNER JOIN branches b
        ON b.id = COALESCE(sib.branch_id, jr.branch_id)

      WHERE p.deleted_at IS NULL
        AND p.status = 'Completed'
        ${paymentDateCondition}
        ${branchCondition}
        ${searchCondition}
        ${paymentModeConditionForRows}

      GROUP BY b.id, b.branch_name
      ORDER BY total_amount DESC
    `;

        if (hasPagination) {
            rowsQuery += ` LIMIT :limit OFFSET :offset`;
            dateReplacements.limit = limitNum;
            dateReplacements.offset = offset;
        }

        const rows = await sequelize.query(rowsQuery, {
            replacements: { ...dateReplacements, ...replacements },
            type: sequelize.QueryTypes.SELECT
        });

        const summaryQuery = `
      SELECT
        COALESCE(SUM(p.amount_received),0) ${shouldDeductRefunds ? `- COALESCE((
          SELECT SUM(DISTINCT sib_inner.refund_amount) 
          FROM payments p_inner
          LEFT JOIN sales_invoice_bills sib_inner
            ON sib_inner.id = p_inner.invoice_bill_id
            AND sib_inner.deleted_at IS NULL
          LEFT JOIN jewel_repairs jr_inner
            ON jr_inner.id = p_inner.jewel_repair_id
            AND jr_inner.deleted_at IS NULL
          INNER JOIN branches b_inner
            ON b_inner.id = COALESCE(sib_inner.branch_id, jr_inner.branch_id)
          WHERE p_inner.deleted_at IS NULL
            AND p_inner.status = 'Completed'
            AND sib_inner.id IS NOT NULL
            ${paymentDateCondition.replace(/p\./g, 'p_inner.')}
            ${branchCondition.replace(/b\./g, 'b_inner.')}
            ${searchCondition.replace(/b\./g, 'b_inner.')}
        ), 0)` : ''} AS total_collection,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Cash' THEN p.amount_received ELSE 0 END),0) ${shouldDeductRefunds ? `- COALESCE((
          SELECT SUM(DISTINCT sib_inner.refund_amount) 
          FROM payments p_inner
          LEFT JOIN sales_invoice_bills sib_inner
            ON sib_inner.id = p_inner.invoice_bill_id
            AND sib_inner.deleted_at IS NULL
          LEFT JOIN jewel_repairs jr_inner
            ON jr_inner.id = p_inner.jewel_repair_id
            AND jr_inner.deleted_at IS NULL
          INNER JOIN branches b_inner
            ON b_inner.id = COALESCE(sib_inner.branch_id, jr_inner.branch_id)
          WHERE p_inner.deleted_at IS NULL
            AND p_inner.status = 'Completed'
            AND sib_inner.id IS NOT NULL
            ${paymentDateCondition.replace(/p\./g, 'p_inner.')}
            ${branchCondition.replace(/b\./g, 'b_inner.')}
            ${searchCondition.replace(/b\./g, 'b_inner.')}
        ), 0)` : ''} AS cash,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'UPI' THEN p.amount_received ELSE 0 END),0) AS upi,
        COALESCE(SUM(CASE WHEN p.payment_mode = 'Card' THEN p.amount_received ELSE 0 END),0) AS card
      FROM payments p
      LEFT JOIN sales_invoice_bills sib
        ON sib.id = p.invoice_bill_id
        AND sib.deleted_at IS NULL
      LEFT JOIN jewel_repairs jr
        ON jr.id = p.jewel_repair_id
        AND jr.deleted_at IS NULL
      INNER JOIN branches b
        ON b.id = COALESCE(sib.branch_id, jr.branch_id)
      WHERE p.deleted_at IS NULL
        AND p.status = 'Completed'
        ${paymentDateCondition}
        ${branchCondition}
        ${searchCondition}
    `;

        const [summaryResult] = await sequelize.query(summaryQuery, {
            replacements: { ...dateReplacements, ...replacements },
            type: sequelize.QueryTypes.SELECT
        });

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
        INNER JOIN branches b
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
                total_collection: Number(summaryResult.total_collection),
                cash: Number(summaryResult.cash),
                upi: Number(summaryResult.upi),
                card: Number(summaryResult.card)
            },
            totalItems,
            rows
        });

    } catch (error) {
        console.error("getBranchwiseRevenue Error:", error);
        return commonService.handleError(res, error);
    }
};


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
            "p.payment_date",
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

        // payment_mode → ONLY for rows
        let paymentModeConditionForRows = "";
        if (payment_mode) {
            paymentModeConditionForRows = `AND p.payment_mode = :payment_mode`;
            replacements.payment_mode = payment_mode;
        }

        // Refund deduction logic: Refunds are cash transactions
        // Deduct from total and cash, but not from UPI/Card
        // Only skip deduction if explicitly filtering by UPI or Card
        // Use MAX instead of SUM to avoid counting the same refund multiple times
        // when an invoice has multiple payment records
        const shouldDeductRefunds = !payment_mode || payment_mode === 'Cash';
        const refundDeduction = shouldDeductRefunds
            ? `- COALESCE(MAX(sib.refund_amount), 0)`
            : '';

        const hasPagination = page && limit;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (Number(page) - 1) * limitNum : null;

        // For rows: only deduct refunds if no payment_mode filter or if payment_mode is Cash
        const rowRefundDeduction = shouldDeductRefunds ? '- COALESCE(MAX(sib.refund_amount), 0)' : '';

        // Always include refund column, but show 0 for UPI/Card filters
        const refundColumn = shouldDeductRefunds
            ? 'COALESCE(MAX(CASE WHEN sib.id IS NOT NULL THEN sib.refund_amount ELSE 0 END), 0)'
            : '0';

        let rowsQuery = `
            SELECT
                COALESCE(sib.invoice_no, jr.repair_code) AS description,

                ${refundColumn} AS refund,

                ROUND(SUM(CASE WHEN p.payment_mode = 'Cash' THEN p.amount_received ELSE 0 END), 2) AS cash,
                ROUND(SUM(CASE WHEN p.payment_mode = 'UPI' THEN p.amount_received ELSE 0 END), 2) AS upi,
                ROUND(SUM(CASE WHEN p.payment_mode = 'Card' THEN p.amount_received ELSE 0 END), 2) AS card,

                ROUND(SUM(p.amount_received) ${rowRefundDeduction}, 2) AS total_amount,

                MAX(p.created_at) AS payment_date

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
                ${paymentModeConditionForRows}

            GROUP BY description
            ${payment_mode ? 'HAVING ROUND(SUM(p.amount_received) ' + rowRefundDeduction + ', 2) > 0' : ''}
            ORDER BY payment_date DESC
            `;

        if (hasPagination) {
            rowsQuery += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const rows = await sequelize.query(rowsQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        const summaryQuery = `
            SELECT
                COALESCE(SUM(p.amount_received), 0) ${shouldDeductRefunds ? `- COALESCE((
                    SELECT SUM(DISTINCT sib_inner.refund_amount) 
                    FROM payments p_inner
                    LEFT JOIN sales_invoice_bills sib_inner
                        ON sib_inner.id = p_inner.invoice_bill_id
                        AND sib_inner.deleted_at IS NULL
                    LEFT JOIN jewel_repairs jr_inner
                        ON jr_inner.id = p_inner.jewel_repair_id
                        AND jr_inner.deleted_at IS NULL
                    WHERE p_inner.deleted_at IS NULL
                        AND p_inner.status = 'Completed'
                        AND COALESCE(sib_inner.branch_id, jr_inner.branch_id) = :branch_id
                        AND sib_inner.id IS NOT NULL
                        ${paymentDateCondition.replace(/p\./g, 'p_inner.')}
                        ${searchCondition.replace(/sib\./g, 'sib_inner.').replace(/jr\./g, 'jr_inner.')}
                        ${paymentModeConditionForRows.replace(/p\./g, 'p_inner.')}
                ), 0)` : ''} AS total_collection,
                COALESCE(SUM(CASE WHEN p.payment_mode = 'Cash' THEN p.amount_received ELSE 0 END), 0) ${shouldDeductRefunds ? `- COALESCE((
                    SELECT SUM(DISTINCT sib_inner.refund_amount) 
                    FROM payments p_inner
                    LEFT JOIN sales_invoice_bills sib_inner
                        ON sib_inner.id = p_inner.invoice_bill_id
                        AND sib_inner.deleted_at IS NULL
                    LEFT JOIN jewel_repairs jr_inner
                        ON jr_inner.id = p_inner.jewel_repair_id
                        AND jr_inner.deleted_at IS NULL
                    WHERE p_inner.deleted_at IS NULL
                        AND p_inner.status = 'Completed'
                        AND COALESCE(sib_inner.branch_id, jr_inner.branch_id) = :branch_id
                        AND sib_inner.id IS NOT NULL
                        ${paymentDateCondition.replace(/p\./g, 'p_inner.')}
                        ${searchCondition.replace(/sib\./g, 'sib_inner.').replace(/jr\./g, 'jr_inner.')}
                        ${paymentModeConditionForRows.replace(/p\./g, 'p_inner.')}
                ), 0)` : ''} AS cash,
                COALESCE(SUM(CASE WHEN p.payment_mode = 'UPI' THEN p.amount_received ELSE 0 END), 0) AS upi,
                COALESCE(SUM(CASE WHEN p.payment_mode = 'Card' THEN p.amount_received ELSE 0 END), 0) AS card
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
                ${paymentModeConditionForRows}
            `;

        const [summaryResult] = await sequelize.query(summaryQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

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
                summary: {
                    total_collection: money(summaryResult.total_collection),
                    cash: money(summaryResult.cash),
                    upi: money(summaryResult.upi),
                    card: money(summaryResult.card)
                },
                totalItems,
                rows
            }
        });

    } catch (error) {
        console.error("getBranchRevenueDetails Error:", error);
        return commonService.handleError(res, error);
    }
};

const getVendorGrnRevenueList = async (req, res) => {
    try {
        const { page, limit, search, date } = req.query;

        const isPaginated = page && limit;
        const pageNum = isPaginated ? Number(page) : 1;
        const limitNum = isPaginated ? Number(limit) : null;
        const offset = isPaginated ? (pageNum - 1) * limitNum : null;

        const replacements = {};
        let whereSql = `
      WHERE g.deleted_at IS NULL
    `;

        if (date) {
            whereSql += ` AND g.grn_date = :date`;
            replacements.date = date;
        }

        if (search) {
            whereSql += ` AND g.grn_no ILIKE :search`;
            replacements.search = `%${search}%`;
        }

        let query = `
            SELECT
                g.id AS grn_id,
                g.grn_date AS date,
                g.grn_no,
                COALESCE(SUM(gi.quantity), 0) AS quantity,
                COALESCE(SUM(gi.gross_wt_in_g), 0) AS weight,
                g.total_amount AS amount,
                SUM(vp.amount) AS received_amount,
                (g.total_amount - SUM(vp.amount)) AS due_amount
            
            FROM grns g
            LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
            
            INNER JOIN vendor_payments vp
            ON vp.purchase_id::int = g.id
            AND vp.deleted_at IS NULL
            AND vp.bill_type_id = 1
            AND vp.user_type_id = 1
            AND vp.purchase_id IS NOT NULL

            ${whereSql}

            GROUP BY g.id
            ORDER BY g.grn_date DESC, g.grn_no DESC
    `;

        if (isPaginated) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const data = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT,
        });

        return commonService.okResponse(res, {
            total: data.length,
            page: isPaginated ? pageNum : null,
            totalPages: isPaginated ? Math.ceil(data.length / limitNum) : 1,
            data,
        });

    } catch (error) {
        console.error("getRevenueList Error:", error);
        return commonService.handleError(res, error);
    }
};


const getVendorGrnView = async (req, res) => {
    try {
        const { grnId } = req.params;

        // GRN + Branch + Vendor
        const [grn] = await sequelize.query(
            `
            SELECT
                g.id,
                g.grn_no,
                g.grn_date,
                g.po_id,
                g.total_amount,
                g.subtotal_amount,
                g.sgst_percent,
                g.cgst_percent,
                g.discount_percent,
                g.remarks,

                v.vendor_name,
                v.address AS vendor_address,
                v.mobile AS vendor_mobile,
                v.gst_no AS vendor_gst_no,

                b.branch_name,
                b.address AS branch_address,
                b.mobile AS branch_mobile,
                b.gst_no AS branch_gst_no,
                b.pin_code

            FROM grns g

            JOIN vendors v 
                ON v.id = g.vendor_id 
            AND v.deleted_at IS NULL

            LEFT JOIN vendor_payments vp
                ON vp.purchase_id::int = g.id
            AND vp.bill_type_id = 1
            AND vp.user_type_id = 1
            AND vp.deleted_at IS NULL

            LEFT JOIN branches b 
                ON b.id = vp.branch_id
            AND b.deleted_at IS NULL

            WHERE g.id = :grnId
                AND g.deleted_at IS NULL
            `,
            {
                replacements: { grnId },
                type: sequelize.QueryTypes.SELECT,
            }
        );


        if (!grn) {
            return commonService.notFound(res, "GRN not found");
        }

        // GRN Items
        const items = await sequelize.query(
            `
            SELECT
                id,
                quantity,
                gross_wt_in_g,
                net_wt_in_g,
                rate_per_g,
                total_amount,
                comments AS product_description
            FROM "grnItems"
            WHERE grn_id = :grnId
                AND deleted_at IS NULL
            ORDER BY id
            `,
                    {
                        replacements: { grnId },
                        type: sequelize.QueryTypes.SELECT,
                    }
                );

        // Payment Details
        const payments = await sequelize.query(
            `
        SELECT
            vp.payment_date,
            vp.payment_no,
            vp.payment_mode,
            vp.transaction_no,
            vp.amount
        FROM vendor_payments vp
        WHERE vp.purchase_id::int = :grnId
            AND vp.bill_type_id = 1
            AND vp.user_type_id = 1
            AND vp.deleted_at IS NULL
        ORDER BY vp.payment_date
        `,
                {
                    replacements: { grnId },
                    type: sequelize.QueryTypes.SELECT,
                }
            );

        const totalPaid = payments.reduce(
            (sum, p) => sum + Number(p.amount || 0),
            0
        );

        const dueAmount = Number(grn.total_amount || 0) - totalPaid;

        return commonService.okResponse(res, {
            grn_details: {
                grn_no: grn.grn_no,
                grn_date: grn.grn_date,
                purchase_order: grn.po_id,
            },

            branch: {
                name: grn.branch_name,
                address: grn.branch_address,
                mobile: grn.branch_mobile,
                gst_no: grn.branch_gst_no,
                pin_code: grn.pin_code,
            },

            vendor: {
                name: grn.vendor_name,
                address: grn.vendor_address,
                mobile: grn.vendor_mobile,
                gst_no: grn.vendor_gst_no,
            },

            items,

            totals: {
                sub_total: grn.subtotal_amount,
                sgst_percent: grn.sgst_percent,
                cgst_percent: grn.cgst_percent,
                discount_percent: grn.discount_percent,
                total_amount: grn.total_amount,
            },

            payments: {
                paid_amount: totalPaid,
                due_amount: dueAmount,
                payment_history: payments,
            },

            remarks: grn.remarks,
        });

    } catch (error) {
        console.error("getGrnView error:", error);
        return commonService.handleError(res, error);
    }
};


module.exports = {
    getBranchwiseRevenue,
    getBranchRevenueDetails,
    getVendorGrnRevenueList,
    getVendorGrnView,
};