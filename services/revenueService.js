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

        const dateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "rs.txn_date",
            dateReplacements
        );

        let branchCondition = "";
        if (branch_id) {
            branchCondition = `AND rs.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
            dateReplacements.branch_id = branch_id;
        }

        let paymentModeCondition = "";
        if (payment_mode) {
            paymentModeCondition = `AND rs.payment_mode = :payment_mode`;
            replacements.payment_mode = payment_mode;
            dateReplacements.payment_mode = payment_mode;
        }

        let searchCondition = "";
        if (search) {
            searchCondition = `AND b.branch_name ILIKE :search`;
            replacements.search = `%${search}%`;
            dateReplacements.search = `%${search}%`;
        }

        const hasPagination = page && limit;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (Number(page) - 1) * limitNum : null;

        const query = `
            WITH revenue_stream AS (

                /* SALES + REPAIR PAYMENTS */
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
                    END AS amount,
                    CASE
                        WHEN sib.id IS NOT NULL
                            AND ROW_NUMBER() OVER (PARTITION BY sib.id ORDER BY p.id) = 1
                        THEN COALESCE(sib.refund_amount, 0)

                        WHEN jr.id IS NOT NULL
                            AND ROW_NUMBER() OVER (PARTITION BY jr.id ORDER BY p.id) = 1
                        THEN COALESCE(jr.refund_amount, 0)

                        ELSE 0
                    END AS refund_amount
                FROM payments p
                LEFT JOIN sales_invoice_bills sib
                    ON sib.id = p.invoice_bill_id
                    AND sib.deleted_at IS NULL
                    AND sib.is_active = true
                LEFT JOIN jewel_repairs jr
                    ON jr.id = p.jewel_repair_id
                    AND jr.deleted_at IS NULL AND jr.is_active = true
                WHERE p.deleted_at IS NULL
                    AND p.status = 'Completed'

                UNION ALL

                /* VOUCHER RECEIPTS */
                SELECT
                    vr.branch_id,
                    vr.receipt_date AS txn_date,
                    pm.payment_mode,
                    vr.amount,
                    0 AS refund_amount
                FROM voucher_receipts vr
                JOIN payment_modes pm ON pm.id = vr.payment_mode_id
                WHERE vr.deleted_at IS NULL AND vr.is_active = true

                UNION ALL

                /* INSTALLMENT REVENUE */
                SELECT
                    c.branch_id,
                    sp.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    p.amount_received AS amount,
                    0 AS refund_amount
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

                /* VENDOR PAYMENTS NEGATIVE */
                SELECT
                    vp.branch_id,
                    vp.payment_date AS txn_date,
                    pm.payment_mode,
                    -vp.amount AS amount,
                    0 AS refund_amount
                FROM vendor_payments vp
                JOIN payment_modes pm ON pm.id = vp.payment_mode
                WHERE vp.deleted_at IS NULL AND vp.is_active = true
                    AND vp.status = 'Completed'
            )

            SELECT
                b.id AS branch_id,
                b.branch_name,

                ROUND(SUM(CASE WHEN rs.payment_mode = 'Cash' THEN rs.amount ELSE 0 END), 2) AS cash,
                ROUND(SUM(CASE WHEN rs.payment_mode = 'UPI' THEN rs.amount ELSE 0 END), 2) AS upi,
                ROUND(SUM(CASE WHEN rs.payment_mode = 'Card' THEN rs.amount ELSE 0 END), 2) AS card,
                ROUND(SUM(rs.refund_amount), 2) AS refund,

                ROUND(SUM(rs.amount), 2) AS total_amount

            FROM revenue_stream rs
            JOIN branches b ON b.id = rs.branch_id AND b.deleted_at IS NULL

            WHERE 1=1
                ${dateCondition}
                ${branchCondition}
                ${searchCondition}

            GROUP BY b.id, b.branch_name
            ORDER BY total_amount DESC
            ${hasPagination ? "LIMIT :limit OFFSET :offset" : ""}
        `;

        if (hasPagination) {
            dateReplacements.limit = limitNum;
            dateReplacements.offset = offset;
        }

        const rows = await sequelize.query(query, {
            replacements: { ...dateReplacements, ...replacements },
            type: sequelize.QueryTypes.SELECT
        });

        const summaryQuery = `
            WITH revenue_stream AS (

                /* SALES + REPAIR PAYMENTS */
                SELECT
                    COALESCE(sib.branch_id, jr.branch_id) AS branch_id,
                    p.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    CASE
                        WHEN p.payment_mode = 'Cash'
                        THEN
                            p.amount_received
                            - COALESCE(
                                CASE
                                    WHEN sib.id IS NOT NULL
                                    THEN MAX(sib.refund_amount) OVER (PARTITION BY sib.id)

                                    WHEN jr.id IS NOT NULL
                                    THEN MAX(jr.refund_amount) OVER (PARTITION BY jr.id)

                                    ELSE 0
                                END,
                                0
                            )
                        ELSE p.amount_received
                    END AS amount,
                    CASE
                        WHEN sib.id IS NOT NULL
                            AND ROW_NUMBER() OVER (PARTITION BY sib.id ORDER BY p.id) = 1
                        THEN COALESCE(sib.refund_amount, 0)

                        WHEN jr.id IS NOT NULL
                            AND ROW_NUMBER() OVER (PARTITION BY jr.id ORDER BY p.id) = 1
                        THEN COALESCE(jr.refund_amount, 0)

                        ELSE 0
                    END AS refund_amount
                FROM payments p
                LEFT JOIN sales_invoice_bills sib
                    ON sib.id = p.invoice_bill_id
                    AND sib.deleted_at IS NULL
                    AND sib.is_active = true
                    AND sib.status = 'Invoice'
                LEFT JOIN jewel_repairs jr
                    ON jr.id = p.jewel_repair_id
                    AND jr.deleted_at IS NULL AND jr.is_active = true
                    AND jr.status = 'Completed'
                WHERE p.deleted_at IS NULL
                    AND p.status = 'Completed'

                UNION ALL

                /* VOUCHER RECEIPTS */
                SELECT
                    vr.branch_id,
                    vr.receipt_date AS txn_date,
                    pm.payment_mode,
                    vr.amount,
                    0 AS refund_amount
                FROM voucher_receipts vr
                JOIN payment_modes pm ON pm.id = vr.payment_mode_id
                WHERE vr.deleted_at IS NULL AND vr.is_active = true

                UNION ALL

                /* INSTALLMENT REVENUE */
                SELECT
                    c.branch_id,
                    sp.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    p.amount_received AS amount,
                    0 AS refund_amount
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

                /* VENDOR PAYMENTS NEGATIVE */
                SELECT
                    vp.branch_id,
                    vp.payment_date AS txn_date,
                    pm.payment_mode,
                    -vp.amount AS amount,
                    0 AS refund_amount
                FROM vendor_payments vp
                JOIN payment_modes pm ON pm.id = vp.payment_mode
                WHERE vp.deleted_at IS NULL AND vp.is_active = true
                    AND vp.status = 'Completed'
            )

            SELECT
                ROUND(SUM(rs.amount), 2) AS total_collection,
                ROUND(SUM(CASE WHEN rs.payment_mode = 'Cash' THEN rs.amount ELSE 0 END), 2) AS cash,
                ROUND(SUM(CASE WHEN rs.payment_mode = 'UPI' THEN rs.amount ELSE 0 END), 2) AS upi,
                ROUND(SUM(CASE WHEN rs.payment_mode = 'Card' THEN rs.amount ELSE 0 END), 2) AS card,
                ROUND(SUM(rs.refund_amount), 2) AS refund
            FROM revenue_stream rs
            JOIN branches b
                ON b.id = rs.branch_id
                AND b.deleted_at IS NULL
            WHERE 1=1
                ${dateCondition}
                ${branchCondition}
                ${paymentModeCondition}
                ${searchCondition}
        `;

        const [summary] = await sequelize.query(summaryQuery, {
            replacements: { ...dateReplacements, ...replacements },
            type: sequelize.QueryTypes.SELECT
        });

        return commonService.okResponse(res, {
            summary,
            totalItems: rows.length,
            rows
        });

    } catch (error) {
        console.error("getBranchwiseRevenue Error:", error);
        return commonService.handleError(res, error);
    }
};


const getBranchRevenueDetailsNew = async (req, res) => {
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

        const dateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "rs.txn_date",
            replacements
        );

        let paymentModeCondition = "";
        if (payment_mode) {
            paymentModeCondition = `AND rs.payment_mode = :payment_mode`;
            replacements.payment_mode = payment_mode;
        }

        let searchCondition = "";
        if (search) {
            searchCondition = `AND rs.description ILIKE :search`;
            replacements.search = `%${search}%`;
        }

        const hasPagination = page && limit;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (Number(page) - 1) * limitNum : null;

        const baseCTE = `
            WITH revenue_stream AS (

                /* SALES + JEWEL REPAIR PAYMENT EVENTS */

                SELECT
                    COALESCE(sib.branch_id, jr.branch_id) AS branch_id,

                    p.payment_date AS txn_date,

                    p.payment_mode::text AS payment_mode,

                    COALESCE(
                        sib.invoice_no,
                        jr.repair_code
                    ) AS description,

                    p.amount_received::numeric AS amount,

                    0::numeric AS refund_amount,

                    CASE
                        WHEN sib.id IS NOT NULL THEN 'SALES'
                        WHEN jr.id IS NOT NULL THEN 'REPAIR'
                    END::text AS source_type,

                    p.payment_date::text AS transaction_id

                FROM payments p

                LEFT JOIN sales_invoice_bills sib
                    ON sib.id = p.invoice_bill_id
                    AND sib.deleted_at IS NULL
                    AND sib.is_active = true AND sib.status = 'Invoice'

                LEFT JOIN jewel_repairs jr
                    ON jr.id = p.jewel_repair_id
                    AND jr.deleted_at IS NULL
                    AND jr.is_active = true AND jr.status = 'Completed'

                WHERE p.deleted_at IS NULL
                AND p.status = 'Completed'
                AND (
                    sib.id IS NOT NULL
                    OR jr.id IS NOT NULL
                )

                UNION ALL


                /* RECEIPTS */

                SELECT
                    vr.branch_id AS branch_id,
                    vr.receipt_date::timestamptz AS txn_date,
                    pm.payment_mode::text AS payment_mode,
                    vr.receipt_no::text AS description,
                    vr.amount::numeric AS amount,
                    0::numeric AS refund_amount,
                    'RECEIPT'::text AS source_type,
                    ('RECEIPT-' || vr.id::text) AS transaction_id

                FROM voucher_receipts vr
                JOIN payment_modes pm
                    ON pm.id = vr.payment_mode_id
                WHERE vr.deleted_at IS NULL
                AND vr.is_active = true

                UNION ALL

                /* SCHEME PAY INSTALLMENT */
                SELECT
                    c.branch_id AS branch_id,
                    p.payment_date AS txn_date,
                    p.payment_mode::text AS payment_mode,
                    sp.scheme_payment_code::text AS description,
                    p.amount_received::numeric AS amount,
                    0::numeric AS refund_amount,
                    'SCHEME'::text AS source_type,
                    p.payment_date::text AS transaction_id

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
                    vp.branch_id AS branch_id,
                    vp.payment_date::timestamptz AS txn_date,
                    pm.payment_mode::text AS payment_mode,
                    vp.payment_no::text AS description,
                    (-vp.amount)::numeric AS amount,
                    0::numeric AS refund_amount,
                    'VENDOR_PAYMENT'::text AS source_type,
                    ('VENDOR-' || vp.id::text) AS transaction_id

                FROM vendor_payments vp
                JOIN payment_modes pm
                    ON pm.id = vp.payment_mode
                WHERE vp.deleted_at IS NULL
                AND vp.is_active = true
                AND vp.status = 'Completed'
            )
        `;

        const havingCondition = `
            HAVING NOT (
                COALESCE(SUM(CASE WHEN payment_mode='Cash' THEN amount ELSE 0 END),0)=0
                AND COALESCE(SUM(CASE WHEN payment_mode='UPI' THEN amount ELSE 0 END),0)=0
                AND COALESCE(SUM(CASE WHEN payment_mode='Card' THEN amount ELSE 0 END),0)=0
                AND COALESCE(SUM(amount),0)=0
            )
        `;

        let rowsQuery = `
            ${baseCTE}

            SELECT
                source_type,
                transaction_id,
                description,
                ROUND(SUM(CASE WHEN payment_mode = 'Cash' THEN amount ELSE 0 END),2) AS cash,
                ROUND(SUM(CASE WHEN payment_mode = 'UPI' THEN amount ELSE 0 END), 2) AS upi,
                ROUND(SUM(CASE WHEN payment_mode = 'Card' THEN amount ELSE 0 END),2) AS card,
                ROUND(MAX(refund_amount), 2) AS refund,
                ROUND(SUM(amount), 2) AS total_amount,
                txn_date AS payment_date

            FROM revenue_stream rs
            WHERE rs.branch_id = :branch_id
            ${dateCondition}
            ${paymentModeCondition}
            ${searchCondition}

            GROUP BY source_type, transaction_id, description, txn_date

            ${havingCondition}

            ORDER BY txn_date DESC

            ${hasPagination ? "LIMIT :limit OFFSET :offset" : ""}
        `;

        if (hasPagination) {
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const rows = await sequelize.query(rowsQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        const summaryQuery = `
        ${baseCTE}

        SELECT
            ROUND(SUM(amount),2) AS total_collection,
            ROUND(SUM(CASE WHEN payment_mode='Cash' THEN amount ELSE 0 END),2) AS cash,
            ROUND(SUM(CASE WHEN payment_mode='UPI' THEN amount ELSE 0 END),2) AS upi,
            ROUND(SUM(CASE WHEN payment_mode='Card' THEN amount ELSE 0 END),2) AS card
        FROM revenue_stream rs
        WHERE rs.branch_id = :branch_id
        ${dateCondition}
        `;

        const [summary] = await sequelize.query(summaryQuery, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        let totalItems = rows.length;

        if (hasPagination) {
           const countQuery = `
                ${baseCTE}
                SELECT COUNT(*)::int AS count
                FROM (
                    SELECT
                        source_type,
                        transaction_id,
                        description,
                        txn_date
                    FROM revenue_stream rs
                    WHERE rs.branch_id = :branch_id
                    ${dateCondition}
                    ${paymentModeCondition}
                    ${searchCondition}
                    GROUP BY source_type, transaction_id, description, txn_date
                    ${havingCondition}
                ) x
            `;

            const [{ count }] = await sequelize.query(countQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT
            });

            totalItems = count;
        }
        
        return commonService.okResponse(res, {
            data: {
                summary: {
                    total_collection: money(summary?.total_collection),
                    cash: money(summary?.cash),
                    upi: money(summary?.upi),
                    card: money(summary?.card)
                },
                totalItems,
                rows: rows.map((r) => ({
                    description: r.description,
                    cash: money(r.cash),
                    upi: money(r.upi),
                    card: money(r.card),
                    refund: money(r.refund),
                    total_amount: money(r.total_amount),
                    payment_date: r.payment_date
                }))
            }
        });

    } catch (error) {
        console.error("getBranchRevenueDetailsNew Error:", error);
        return commonService.handleError(res, error);
    }
};


const getVendorGrnRevenueList = async (req, res) => {
    try {
        const { page, limit, search, date, vendor_id } = req.query;

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

        if (vendor_id) {
            whereSql += ` AND g.vendor_id = :vendor_id`;
            replacements.vendor_id = parseInt(vendor_id);
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
            AND vp.is_active = true
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
                g.igst_percent,
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
            AND vp.is_active = true
            AND vp.deleted_at IS NULL

            LEFT JOIN branches b 
                ON b.id = g.branch_id
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
                gi.id,
                gi.ref_no,

                mt.material_type,
                gi.purity,
                gi.material_price_per_g,

                c.category_name AS category,
                sc.subcategory_name AS sub_category,

                gi.type,
                gi.quantity,

                gi.net_wt_in_g      AS total_wt_in_g,      --need to replace with total_wt_in_gm column when available
                COALESCE(gi.others_wt_in_g, 0) AS bag_wt_in_g, -- need to replace with bag_wt column when available
                gi.gross_wt_in_g,
                COALESCE(gi.stone_wt_in_g, 0)  AS stone_wt_in_g,

                gi.others,
                gi.total_amount

            FROM "grnItems" gi

            LEFT JOIN "materialTypes" mt
                ON mt.id = gi.material_type_id
                AND mt.deleted_at IS NULL

            LEFT JOIN categories c
                ON c.id = gi.category_id
                AND c.deleted_at IS NULL

            LEFT JOIN subcategories sc
                ON sc.id = gi.subcategory_id
                AND sc.deleted_at IS NULL

            WHERE gi.grn_id = :grnId
                AND gi.deleted_at IS NULL

            ORDER BY gi.id
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
            vp.amount,
            pm.payment_mode AS payment_mode_name
        FROM vendor_payments vp
        LEFT JOIN payment_modes pm ON pm.id = vp.payment_mode AND pm.deleted_at IS NULL
        WHERE vp.purchase_id::int = :grnId
            AND vp.bill_type_id = 1
            AND vp.user_type_id = 1
            AND vp.is_active = true
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
    getBranchRevenueDetailsNew,
    getVendorGrnRevenueList,
    getVendorGrnView,
};