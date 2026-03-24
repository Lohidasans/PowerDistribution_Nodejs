const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { dateFilter } = require("../helpers/dateHelper");
const { calculateSellingPriceSync } = require("../services/productService");

const getSalesInvoiceReport = async (req, res) => {
    try {
        const {
            branch_id,
            employee_id,
            customer_id,
            search,
            from_date,
            to_date,
            date_filter,
            page,
            limit,
        } = req.query;

        const usePagination = page !== undefined || limit !== undefined;

        const pageNum = usePagination ? parseInt(page || 1, 10) : null;
        const limitNum = usePagination ? parseInt(limit || 10, 10) : null;
        const offset = usePagination ? (pageNum - 1) * limitNum : null;

        const replacements = {};

        // 🔹 BASE WHERE
        let baseWhere = `
      WHERE sib.deleted_at IS NULL
      AND sib.status = 'Invoice'
      AND sib.is_active = true
    `;

        let extraWhere = "";

        if (branch_id) {
            extraWhere += ` AND sib.branch_id = :branch_id`;
            replacements.branch_id = +branch_id;
        }

        if (employee_id) {
            extraWhere += ` AND sib.employee_id = :employee_id`;
            replacements.employee_id = +employee_id;
        }

        if (customer_id) {
            extraWhere += ` AND sib.customer_id = :customer_id`;
            replacements.customer_id = +customer_id;
        }

        // Date filter
        extraWhere += dateFilter(
            { from_date, to_date, date_filter },
            "sib.invoice_date",
            replacements
        );

        // 🔹 SEARCH
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fi.invoice_no ILIKE :search OR
          c.customer_name ILIKE :search OR
          e.employee_name ILIKE :search OR
          adj.old_jewel_no ILIKE :search OR
          adj.sales_return_no ILIKE :search OR
          adj.scheme_no ILIKE :search OR
          EXISTS (
            SELECT 1 FROM sales_invoice_bill_items sii
            LEFT JOIN "productItemDetails" pid ON pid.id = sii.product_item_detail_id
            LEFT JOIN products p ON p.id = pid.product_id
            WHERE sii.invoice_bill_id = fi.id
            AND (
              sii.product_name_snapshot ILIKE :search OR
              pid.sku_id ILIKE :search OR
              p.sku_id ILIKE :search
            )
          )
        )
      `;
            replacements.search = `%${search}%`;
        }

        let query = `
      WITH filtered_invoices AS (
        SELECT
          sib.id,
          sib.invoice_no,
          sib.invoice_date,
          sib.customer_id,
          sib.employee_id,
          sib.branch_id,
          sib.net_total,
          sib.subtotal_amount,
          sib.cgst_amount,
          sib.sgst_amount,
          sib.igst_amount,
          sib.discount_amount,
          sib.total_amount
        FROM sales_invoice_bills sib
        ${baseWhere}
        ${extraWhere}
      ),

      adjustments AS (
        SELECT
          sales_invoice_id,

          MAX(CASE WHEN adjustment_type_id = '2' THEN reference_no END) AS old_jewel_no,
          SUM(CASE WHEN adjustment_type_id = '2' THEN adjustment_amount ELSE 0 END) AS old_jewel_amount,

          MAX(CASE WHEN adjustment_type_id = '1' THEN reference_no END) AS sales_return_no,
          SUM(CASE WHEN adjustment_type_id = '1' THEN adjustment_amount ELSE 0 END) AS sales_return_amount,

          MAX(CASE WHEN adjustment_type_id = '3' THEN reference_no END) AS scheme_no,
          SUM(CASE WHEN adjustment_type_id = '3' THEN adjustment_amount ELSE 0 END) AS scheme_amount

        FROM sales_invoice_adjustments
        WHERE deleted_at IS NULL
        GROUP BY sales_invoice_id
      ),

      items AS (
        SELECT
          sii.invoice_bill_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_item_detail_id', sii.product_item_detail_id,
              'product_name', sii.product_name_snapshot,
              'quantity', sii.quantity,
              'rate', sii.rate,
              'amount', sii.amount,
              'product_sku_id', p.sku_id,
              'product_item_sku_id', pid.sku_id
            )
          ) AS items
        FROM sales_invoice_bill_items sii
        LEFT JOIN "productItemDetails" pid ON pid.id = sii.product_item_detail_id
        LEFT JOIN products p ON p.id = pid.product_id
        WHERE sii.deleted_at IS NULL
        GROUP BY sii.invoice_bill_id
      )

      SELECT
        fi.id,
        fi.invoice_no,
        fi.invoice_date,
        c.customer_name,
        e.employee_name,
        fi.branch_id,
        fi.customer_id,
        fi.employee_id,

        i.items,

        fi.net_total,
        fi.subtotal_amount,
        fi.cgst_amount,
        fi.sgst_amount,
        fi.igst_amount,

        adj.old_jewel_no,
        adj.old_jewel_amount,
        adj.sales_return_no,
        adj.sales_return_amount,
        adj.scheme_no,
        adj.scheme_amount,

        fi.discount_amount,
        fi.total_amount

      FROM filtered_invoices fi
      LEFT JOIN items i ON i.invoice_bill_id = fi.id
      LEFT JOIN customers c ON c.id = fi.customer_id
      LEFT JOIN employees e ON e.id = fi.employee_id
      LEFT JOIN adjustments adj ON adj.sales_invoice_id = fi.id

      WHERE 1=1
      ${searchClause}

      ORDER BY fi.invoice_date DESC
    `;

        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        if (usePagination) {
            const countQuery = `
        SELECT COUNT(*) AS total
        FROM sales_invoice_bills sib
        ${baseWhere}
        ${extraWhere}
      `;

            const [countResult] = await sequelize.query(countQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            });

            total = Number(countResult.total);
        }

        const response = { list: rows };

        if (usePagination) {
            response.pagination = {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            };
        }

        return commonService.okResponse(res, response);

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
};

const getSalesReturnReport = async (req, res) => {
    try {
        const {
            branch_id,
            employee_id,
            customer_id,
            search,
            from_date,
            to_date,
            date_filter,
            page,
            limit,
        } = req.query;

        const usePagination = page !== undefined && limit !== undefined;

        const pageNum = usePagination ? parseInt(page, 10) : null;
        const limitNum = usePagination ? parseInt(limit, 10) : null;
        const offset = usePagination ? (pageNum - 1) * limitNum : null;

        const replacements = {};

        // 🔹 BASE WHERE
        let baseWhere = `
      WHERE sr.deleted_at IS NULL
      AND sr.is_active = true
      AND sr.status = 'Printed'
    `;

        let extraWhere = "";

        if (branch_id) {
            extraWhere += ` AND sr.branch_id = :branch_id`;
            replacements.branch_id = +branch_id;
        }

        if (employee_id) {
            extraWhere += ` AND sr.employee_id = :employee_id`;
            replacements.employee_id = +employee_id;
        }

        if (customer_id) {
            extraWhere += ` AND sr.customer_id = :customer_id`;
            replacements.customer_id = +customer_id;
        }

        // 🔹 DATE FILTER
        extraWhere += dateFilter(
            { from_date, to_date, date_filter },
            "sr.return_date",
            replacements
        );

        // 🔹 SEARCH
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fr.sales_return_no ILIKE :search OR
          c.customer_name ILIKE :search OR
          e.employee_name ILIKE :search OR
          EXISTS (
            SELECT 1 FROM sales_return_items sri
            LEFT JOIN "productItemDetails" pid ON pid.id = sri.product_item_detail_id
            LEFT JOIN products p ON p.id = pid.product_id
            WHERE sri.sales_return_id = fr.id
            AND (
              sri.product_description ILIKE :search OR
              sri.invoice_no ILIKE :search OR
              pid.sku_id ILIKE :search OR
              p.sku_id ILIKE :search
            )
          )
        )
      `;
            replacements.search = `%${search}%`;
        }

        // 🔹 MAIN QUERY
        let query = `
      WITH filtered_returns AS (
        SELECT
          sr.id,
          sr.sales_return_no,
          sr.return_date,
          sr.customer_id,
          sr.employee_id,
          sr.branch_id,
          sr.subtotal_amount,
          sr.cgst_amount,
          sr.sgst_amount,
          sr.igst_amount,
          sr.total_amount
        FROM sales_returns sr
        ${baseWhere}
        ${extraWhere}
      ),

      items AS (
        SELECT
          sri.sales_return_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_item_detail_id', sri.product_item_detail_id,
              'product_description', sri.product_description,
              'quantity', sri.quantity,
              'rate', sri.rate,
              'amount', sri.amount,
              'invoice_no', sri.invoice_no,
              'product_sku_id', p.sku_id,
              'product_item_sku_id', pid.sku_id
            )
          ) AS items
        FROM sales_return_items sri
        LEFT JOIN "productItemDetails" pid ON pid.id = sri.product_item_detail_id
        LEFT JOIN products p ON p.id = pid.product_id
        WHERE sri.deleted_at IS NULL
        GROUP BY sri.sales_return_id
      )

      SELECT
        fr.id,
        fr.sales_return_no,
        fr.return_date,
        fr.branch_id,
        fr.customer_id,
        fr.employee_id,

        c.customer_name,
        e.employee_name,

        i.items,

        fr.subtotal_amount,
        fr.cgst_amount,
        fr.sgst_amount,
        fr.igst_amount,
        fr.total_amount

      FROM filtered_returns fr
      LEFT JOIN items i ON i.sales_return_id = fr.id
      LEFT JOIN customers c ON c.id = fr.customer_id
      LEFT JOIN employees e ON e.id = fr.employee_id

      WHERE 1=1
      ${searchClause}

      ORDER BY fr.return_date DESC
    `;

        // 🔹 PAGINATION
        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        if (usePagination) {
            const countQuery = `
        SELECT COUNT(*) AS total
        FROM sales_returns sr
        ${baseWhere}
        ${extraWhere}
      `;

            const [countResult] = await sequelize.query(countQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            });

            total = Number(countResult.total);
        }

        const response = { list: rows };

        if (usePagination) {
            response.pagination = {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            };
        }

        return commonService.okResponse(res, response);

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
};

const getOldJewelReport = async (req, res) => {
    try {
        const {
            branch_id,
            employee_id,
            customer_id,
            search,
            from_date,
            to_date,
            date_filter,
            page,
            limit,
        } = req.query;

        const usePagination = page !== undefined && limit !== undefined;

        const pageNum = usePagination ? parseInt(page, 10) : null;
        const limitNum = usePagination ? parseInt(limit, 10) : null;
        const offset = usePagination ? (pageNum - 1) * limitNum : null;

        const replacements = {};

        // 🔹 BASE WHERE
        let baseWhere = `
      WHERE oj.deleted_at IS NULL
      AND oj.is_active = true
      AND oj.status = 'Printed'
    `;

        let extraWhere = "";

        if (branch_id) {
            extraWhere += ` AND oj.branch_id = :branch_id`;
            replacements.branch_id = +branch_id;
        }

        if (employee_id) {
            extraWhere += ` AND oj.employee_id = :employee_id`;
            replacements.employee_id = +employee_id;
        }

        if (customer_id) {
            extraWhere += ` AND oj.customer_id = :customer_id`;
            replacements.customer_id = +customer_id;
        }

        // 🔹 DATE FILTER
        extraWhere += dateFilter(
            { from_date, to_date, date_filter },
            "oj.date",
            replacements
        );

        // 🔹 SEARCH
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fo.old_jewel_code ILIKE :search OR
          c.customer_name ILIKE :search OR
          e.employee_name ILIKE :search OR
          EXISTS (
            SELECT 1 FROM old_jewel_items oji
            LEFT JOIN "materialTypes" mt ON mt.id = oji.material_type_id
            WHERE oji.old_jewel_id = fo.id
            AND (
              oji.jewel_description ILIKE :search OR
              oji.hsn_code ILIKE :search OR
              mt.material_type ILIKE :search
            )
          )
        )
      `;
            replacements.search = `%${search}%`;
        }

        // 🔹 MAIN QUERY
        let query = `
      WITH filtered_old_jewels AS (
        SELECT
          oj.id,
          oj.old_jewel_code,
          oj.date,
          oj.customer_id,
          oj.employee_id,
          oj.branch_id,
          oj.total_amount
        FROM old_jewels oj
        ${baseWhere}
        ${extraWhere}
      ),

      items AS (
        SELECT
          oji.old_jewel_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'material_type', mt.material_type,
              'jewel_description', oji.jewel_description,
              'hsn_code', oji.hsn_code,
              'grs_weight', oji.grs_weight,
              'wastage', oji.wastage,
              'dust_weight', oji.dust_weight,
              'net_weight', oji.net_weight,
              'rate', oji.rate,
              'amount', oji.amount
            )
          ) AS items
        FROM old_jewel_items oji
        LEFT JOIN "materialTypes" mt ON mt.id = oji.material_type_id
        WHERE oji.deleted_at IS NULL
        GROUP BY oji.old_jewel_id
      ),

      invoice_map AS (
        SELECT
          sa.reference_id AS old_jewel_id,
          MAX(sib.invoice_no) AS invoice_no
        FROM sales_invoice_adjustments sa
        JOIN sales_invoice_bills sib 
          ON sib.id = sa.sales_invoice_id
          AND sib.deleted_at IS NULL
          AND sib.status = 'Invoice'
          AND sib.is_active = true
        WHERE sa.deleted_at IS NULL
          AND sa.adjustment_type_id = '2'
        GROUP BY sa.reference_id
      )

      SELECT
        fo.id,
        fo.old_jewel_code,
        fo.date,
        fo.branch_id,
        fo.customer_id,
        fo.employee_id,

        c.customer_name,
        e.employee_name,

        i.items,

        fo.total_amount,
        inv.invoice_no

      FROM filtered_old_jewels fo

      LEFT JOIN items i ON i.old_jewel_id = fo.id
      LEFT JOIN customers c ON c.id = fo.customer_id
      LEFT JOIN employees e ON e.id = fo.employee_id
      LEFT JOIN invoice_map inv ON inv.old_jewel_id = fo.id

      WHERE 1=1
      ${searchClause}

      ORDER BY fo.date DESC
    `;

        // 🔹 PAGINATION
        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        if (usePagination) {
            const countQuery = `
        SELECT COUNT(*) AS total
        FROM old_jewels oj
        ${baseWhere}
        ${extraWhere}
      `;

            const [countResult] = await sequelize.query(countQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            });

            total = Number(countResult.total);
        }

        const response = { list: rows };

        if (usePagination) {
            response.pagination = {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            };
        }

        return commonService.okResponse(res, response);

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
}; 

const getJewelRepairReport = async (req, res) => {
    try {
        const {
            branch_id,
            employee_id,
            customer_id,
            search,
            from_date,
            to_date,
            date_filter,
            page,
            limit,
        } = req.query;

        const usePagination = page !== undefined && limit !== undefined;

        const pageNum = usePagination ? parseInt(page, 10) : null;
        const limitNum = usePagination ? parseInt(limit, 10) : null;
        const offset = usePagination ? (pageNum - 1) * limitNum : null;

        const replacements = {};

        // 🔹 BASE WHERE
        let baseWhere = `
      WHERE jr.deleted_at IS NULL
      AND jr.is_active = true
      AND jr.status = 'Completed'
    `;

        let extraWhere = "";

        if (branch_id) {
            extraWhere += ` AND jr.branch_id = :branch_id`;
            replacements.branch_id = +branch_id;
        }

        if (employee_id) {
            extraWhere += ` AND jr.employee_id = :employee_id`;
            replacements.employee_id = +employee_id;
        }

        if (customer_id) {
            extraWhere += ` AND jr.customer_id = :customer_id`;
            replacements.customer_id = +customer_id;
        }

        // 🔹 DATE FILTER
        extraWhere += dateFilter(
            { from_date, to_date, date_filter },
            "jr.date",
            replacements
        );

        // 🔹 SEARCH
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fr.repair_code ILIKE :search OR
          c.customer_name ILIKE :search OR
          e.employee_name ILIKE :search OR
          EXISTS (
            SELECT 1 FROM jewel_repair_items jri
            LEFT JOIN "materialTypes" mt ON mt.id = jri.material_type_id
            WHERE jri.repair_id = fr.id
            AND (
              jri.description ILIKE :search OR
              jri.remarks ILIKE :search OR
              mt.material_type ILIKE :search
            )
          )
        )
      `;
            replacements.search = `%${search}%`;
        }

        // 🔹 MAIN QUERY
        let query = `
      WITH filtered_repairs AS (
        SELECT
          jr.id,
          jr.repair_code,
          jr.date,
          jr.customer_id,
          jr.employee_id,
          jr.branch_id,
          jr.sub_total_amount,
          jr.discount,
          jr.total_amount,
          jr.amount_due
        FROM jewel_repairs jr
        ${baseWhere}
        ${extraWhere}
      ),

      -- 🔹 GROUP ITEMS
      items AS (
        SELECT
          jri.repair_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'material_type', mt.material_type,
              'description', jri.description,
              'weight', jri.weight,
              'quantity', jri.quantity,
              'remarks', jri.remarks,
              'amount', jri.amount
            )
          ) AS items
        FROM jewel_repair_items jri
        LEFT JOIN "materialTypes" mt ON mt.id = jri.material_type_id
        WHERE jri.deleted_at IS NULL
        GROUP BY jri.repair_id
      ),

      -- 🔹 GROUP PAYMENTS
      payments AS (
        SELECT
          jewel_repair_id,
          SUM(amount_received) AS total_paid
        FROM payments
        WHERE status = 'Completed'
          AND jewel_repair_id IS NOT NULL
        GROUP BY jewel_repair_id
      )

      SELECT
        fr.id,
        fr.repair_code,
        fr.date,
        fr.branch_id,
        fr.customer_id,
        fr.employee_id,

        c.customer_name,
        e.employee_name,

        i.items,

        fr.sub_total_amount,
        fr.discount,
        fr.total_amount,
        fr.amount_due,

        COALESCE(p.total_paid, 0) AS total_paid

      FROM filtered_repairs fr

      LEFT JOIN items i ON i.repair_id = fr.id
      LEFT JOIN customers c ON c.id = fr.customer_id
      LEFT JOIN employees e ON e.id = fr.employee_id
      LEFT JOIN payments p ON p.jewel_repair_id = fr.id

      WHERE 1=1
      ${searchClause}

      ORDER BY fr.date DESC
    `;

        // 🔹 PAGINATION
        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        if (usePagination) {
            const countQuery = `
        SELECT COUNT(*) AS total
        FROM jewel_repairs jr
        ${baseWhere}
        ${extraWhere}
      `;

            const [countResult] = await sequelize.query(countQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            });

            total = Number(countResult.total);
        }

        const response = { list: rows };

        if (usePagination) {
            response.pagination = {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            };
        }

        return commonService.okResponse(res, response);

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
};

const getPurchaseReport = async (req, res) => {
    try {
        const {
            branch_id,
            vendor_id,
            grn_no,
            ref_no,
            material_type_id,
            category_id,
            subcategory_id,
            search,
            from_date,
            to_date,
            date_filter,
            page,
            limit,
        } = req.query;

        const usePagination = page !== undefined && limit !== undefined;

        const pageNum = usePagination ? parseInt(page, 10) : null;
        const limitNum = usePagination ? parseInt(limit, 10) : null;
        const offset = usePagination ? (pageNum - 1) * limitNum : null;

        const replacements = {};

        // 🔹 BASE WHERE (GRN)
        let baseWhere = `
      WHERE g.deleted_at IS NULL
      AND g.is_active = true
    `;

        let extraWhere = "";

        if (branch_id) {
            extraWhere += ` AND g.branch_id = :branch_id`;
            replacements.branch_id = +branch_id;
        }

        if (vendor_id) {
            extraWhere += ` AND g.vendor_id = :vendor_id`;
            replacements.vendor_id = +vendor_id;
        }

        if (grn_no) {
            extraWhere += ` AND g.grn_no ILIKE :grn_no`;
            replacements.grn_no = `%${grn_no}%`;
        }

        // 🔹 DATE FILTER
        extraWhere += dateFilter(
            { from_date, to_date, date_filter },
            "g.grn_date",
            replacements
        );

        // 🔹 ITEM FILTER (for EXISTS)
        let itemFilter = `
      gi.deleted_at IS NULL
    `;

        if (ref_no) {
            itemFilter += ` AND gi.ref_no ILIKE :ref_no`;
            replacements.ref_no = `%${ref_no}%`;
        }

        if (material_type_id) {
            itemFilter += ` AND gi.material_type_id = :material_type_id`;
            replacements.material_type_id = +material_type_id;
        }

        if (category_id) {
            itemFilter += ` AND gi.category_id = :category_id`;
            replacements.category_id = +category_id;
        }

        if (subcategory_id) {
            itemFilter += ` AND gi.subcategory_id = :subcategory_id`;
            replacements.subcategory_id = +subcategory_id;
        }

        // 🔹 APPLY ITEM FILTER TO GRN
        if (ref_no || material_type_id || category_id || subcategory_id) {
            extraWhere += `
        AND EXISTS (
          SELECT 1 FROM "grnItems" gi
          WHERE gi.grn_id = g.id
          AND ${itemFilter}
        )
      `;
        }

        // 🔹 SEARCH
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fg.grn_no ILIKE :search OR
          v.vendor_name ILIKE :search OR
          EXISTS (
            SELECT 1 FROM "grnItems" gi
            LEFT JOIN "materialTypes" mt ON mt.id = gi.material_type_id
            LEFT JOIN categories ct ON ct.id = gi.category_id
            LEFT JOIN subcategories sc ON sc.id = gi.subcategory_id
            WHERE gi.grn_id = fg.id
            AND (
              gi.ref_no ILIKE :search OR
              mt.material_type ILIKE :search OR
              ct.category_name ILIKE :search OR
              sc.subcategory_name ILIKE :search OR
              gi.others ILIKE :search
            )
          )
        )
      `;
            replacements.search = `%${search}%`;
        }

        // 🔹 MAIN QUERY
        let query = `
      WITH filtered_grns AS (
        SELECT
          g.id,
          g.grn_no,
          g.grn_date,
          g.vendor_id,
          g.branch_id,
          g.total_amount,
          g.sgst_percent,
          g.cgst_percent,
          g.discount_percent
        FROM grns g
        ${baseWhere}
        ${extraWhere}
      ),

      items AS (
        SELECT
          gi.grn_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'ref_no', gi.ref_no,
              'material_type', mt.material_type,
              'purity', gi.purity,
              'material_price_per_g', gi.material_price_per_g,
              'category_name', ct.category_name,
              'subcategory_name', sc.subcategory_name,
              'type', gi.type,
              'quantity', gi.quantity,
              'gross_wt_in_g', gi.gross_wt_in_g,
              'stone_wt_in_g', gi.stone_wt_in_g,
              'others', gi.others,
              'others_wt_in_g', gi.others_wt_in_g,
              'others_value', gi.others_value,
              'net_wt_in_g', gi.net_wt_in_g,
              'purchase_rate', gi.purchase_rate,
              'stone_rate', gi.stone_rate,
              'making_charge', gi.making_charge,
              'rate_per_g', gi.rate_per_g,
              'total_amount', gi.total_amount,
              'sgst', ROUND(gi.total_amount * fg.sgst_percent / 100, 2),
              'cgst', ROUND(gi.total_amount * fg.cgst_percent / 100, 2)
            )
          ) AS items
        FROM "grnItems" gi
        LEFT JOIN filtered_grns fg ON fg.id = gi.grn_id
        LEFT JOIN "materialTypes" mt ON mt.id = gi.material_type_id
        LEFT JOIN categories ct ON ct.id = gi.category_id
        LEFT JOIN subcategories sc ON sc.id = gi.subcategory_id
        WHERE gi.deleted_at IS NULL
        GROUP BY gi.grn_id
      )

      SELECT
        fg.id,
        fg.grn_no,
        fg.grn_date,
        fg.branch_id,
        fg.vendor_id,
        v.vendor_name,

        i.items,

        fg.total_amount AS grand_total,
        fg.discount_percent AS round_off

      FROM filtered_grns fg
      LEFT JOIN items i ON i.grn_id = fg.id
      LEFT JOIN vendors v ON v.id = fg.vendor_id

      WHERE 1=1
      ${searchClause}

      ORDER BY fg.grn_date DESC
    `;

        // 🔹 PAGINATION
        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        // 🔹 COUNT QUERY
        if (usePagination) {
            const countQuery = `
        SELECT COUNT(*) AS total
        FROM grns g
        ${baseWhere}
        ${extraWhere}
      `;

            const [countResult] = await sequelize.query(countQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            });

            total = Number(countResult.total);
        }

        const response = { list: rows };

        if (usePagination) {
            response.pagination = {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            };
        }

        return commonService.okResponse(res, response);

    } catch (err) {
        console.error(err);
        return commonService.handleError(res, err);
    }
};

const getProductWiseReport = async (req, res) => {
  try {
    const {
      branch_id,
      material_type_id,
      vendor_id,
      category_id,
      subcategory_id,
      grn_no,
      ref_no,
      search,
      page,
      limit,
    } = req.query;

    const usePagination = page !== undefined && limit !== undefined;

    const pageNum = usePagination ? parseInt(page, 10) : null;
    const limitNum = usePagination ? parseInt(limit, 10) : null;
    const offset = usePagination ? (pageNum - 1) * limitNum : null;

    const replacements = {};

    // 🔹 BASE WHERE (PRODUCT LEVEL - BEST PRACTICE)
    let where = `
      WHERE p.deleted_at IS NULL
      AND p.status = 'Active'
    `;

    if (branch_id) {
      where += ` AND p.branch_id = :branch_id`;
      replacements.branch_id = +branch_id;
    }

    if (vendor_id) {
      where += ` AND p.vendor_id = :vendor_id`;
      replacements.vendor_id = +vendor_id;
    }

    if (material_type_id) {
      where += ` AND p.material_type_id = :material_type_id`;
      replacements.material_type_id = +material_type_id;
    }

    if (category_id) {
      where += ` AND p.category_id = :category_id`;
      replacements.category_id = +category_id;
    }

    if (subcategory_id) {
      where += ` AND p.subcategory_id = :subcategory_id`;
      replacements.subcategory_id = +subcategory_id;
    }

    if (grn_no) {
      where += ` AND g.grn_no ILIKE :grn_no`;
      replacements.grn_no = `%${grn_no}%`;
    }

    if (ref_no) {
      where += ` AND gi.ref_no ILIKE :ref_no`;
      replacements.ref_no = `%${ref_no}%`;
    }

    // 🔍 SEARCH
    if (search) {
      where += `
        AND (
          g.grn_no ILIKE :search OR
          gi.ref_no ILIKE :search OR
          v.vendor_name ILIKE :search OR
          mt.material_type ILIKE :search OR
          c.category_name ILIKE :search OR
          sc.subcategory_name ILIKE :search OR
          p.product_name ILIKE :search OR
          p.sku_id ILIKE :search OR
          pid.sku_id ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    // 🔹 MAIN QUERY
    let query = `
      SELECT
          g.grn_no,
          g.grn_date,
          p.branch_id,

          v.vendor_name,

          gi.ref_no,

          mt.material_type,
          mt.material_price,
          c.category_name,
          sc.subcategory_name,

          p.id AS product_id,
          p.product_name,
          p.sku_id,
          p.product_type,

        -- AGGREGATED VALUES
        SUM(pid.quantity) AS total_quantity,
          ROUND(SUM(pid.net_weight), 3) AS total_net_weight,
            ROUND(SUM(pid.gross_weight), 3) AS total_gross_weight,

        -- PURCHASE PRICE(TOTAL)
        ROUND(SUM(gi.rate_per_g * pid.net_weight), 2) AS purchase_price,

        -- ITEMS(NESTED)
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'item_id', pid.id,
            'item_sku', pid.sku_id,
            'variation', pid.variation,
            'quantity', pid.quantity,
            'gross_weight', pid.gross_weight,
            'net_weight', pid.net_weight,
            'stone_weight', pid.stone_weight,
            'stone_value', pid.stone_value,
            'making_charge', pid.making_charge,
            'making_charge_type', pid.making_charge_type,
            'wastage', pid.wastage,
            'wastage_type', pid.wastage_type
          )
        ) FILTER(WHERE pid.id IS NOT NULL) AS items

      FROM products p

      LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
      LEFT JOIN "grnItems" gi ON gi.id = p.ref_no_id
      LEFT JOIN "productItemDetails" pid ON pid.product_id = p.id AND pid.deleted_at IS NULL

      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id

      ${ where }

      GROUP BY
        g.grn_no,
          g.grn_date,
          g.branch_id,
          v.vendor_name,
          gi.ref_no,
          mt.material_type,
          mt.material_price,
          c.category_name,
          sc.subcategory_name,
          p.id

      ORDER BY g.grn_date DESC
    `;

    if (usePagination) {
      query += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = limitNum;
      replacements.offset = offset;
    }

    const rows = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // SELLING PRICE CALCULATION
    const finalRows = rows.map((row) => {
      let totalSellingPrice = 0;

      const items = row.items || [];

      const calculatedItems = items.map((item) => {
        const calc = calculateSellingPriceSync(
          { product_type: row.product_type },
          {
            net_weight: item.net_weight,
            stone_value: item.stone_value,
            making_charge: item.making_charge,
            making_charge_type: item.making_charge_type,
            wastage: item.wastage,
            wastage_type: item.wastage_type,
            rate_per_gram: row.rate_per_g, 
          },
          [],
          row.material_price
        );

        totalSellingPrice += Number(calc.selling_price || 0);

        return {
          ...item,
          selling_price: Number(calc.selling_price || 0),
        };
      });

      const purchasePrice = Number(row.purchase_price || 0);

      return {
        ...row,
        items: calculatedItems,
        selling_price: Number(totalSellingPrice.toFixed(2)),
        profit: Number((totalSellingPrice - purchasePrice).toFixed(2)),
      };
    });

    // 🔹 COUNT
    let total = null;
    if (usePagination) {
      const countQuery = `
        SELECT COUNT(DISTINCT p.id) AS total
        FROM products p
        LEFT JOIN grns g ON g.id = p.grn_id
        LEFT JOIN "grnItems" gi ON gi.id = p.ref_no_id
        ${where}
      `;

      const [countResult] = await sequelize.query(countQuery, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      });

      total = Number(countResult.total);
    }

    const response = { list: finalRows };

    if (usePagination) {
      response.pagination = {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      };
    }

    return commonService.okResponse(res, response);

  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
    getSalesInvoiceReport,
    getSalesReturnReport,
    getOldJewelReport,
    getJewelRepairReport,
    getPurchaseReport,
    getProductWiseReport
}