const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { dateFilter } = require("../helpers/dateHelper");


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

        // 🔹 BASE WHERE (ONLY sib)
        let baseWhere = `
      WHERE sib.deleted_at IS NULL
      AND sib.status = 'Invoice'
      AND sib.is_active = true
    `;

        // 🔹 EXTRA FILTERS
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

        // 🔹 SEARCH (APPLIED AFTER JOINS)
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fi.invoice_no ILIKE :search OR
          c.customer_name ILIKE :search OR
          e.employee_name ILIKE :search OR
          i.product_name_snapshot ILIKE :search OR
          i.product_sku_id ILIKE :search OR
          i.product_item_sku_id ILIKE :search OR
          adj.old_jewel_no ILIKE :search OR
          adj.sales_return_no ILIKE :search OR
          adj.scheme_no ILIKE :search
        )
      `;
            replacements.search = `%${search}%`;
        }

        // 🔹 MAIN QUERY
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
          sii.product_item_detail_id,
          sii.product_name_snapshot,
          sii.quantity,
          sii.rate,
          sii.amount,
          pid.sku_id AS product_item_sku_id,
          p.sku_id AS product_sku_id
        FROM sales_invoice_bill_items sii
        LEFT JOIN "productItemDetails" pid 
          ON sii.product_item_detail_id = pid.id AND pid.deleted_at IS NULL
        LEFT JOIN products p 
          ON p.id = pid.product_id AND p.deleted_at IS NULL
        WHERE sii.deleted_at IS NULL
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

        i.product_item_detail_id,
        i.product_name_snapshot,
        i.quantity,
        i.rate,
        i.amount,
        i.product_sku_id,
        i.product_item_sku_id,

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

        // 🔹 Pagination
        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        // 🔹 COUNT QUERY (optimized)
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
        AND sr.status != 'Cancelled'
        `;

        // 🔹 EXTRA FILTERS
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

        // Date filter
        extraWhere += dateFilter(
            { from_date, to_date, date_filter },
            "sr.return_date",
            replacements
        );

        // 🔹 SEARCH (AFTER JOINS)
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fr.sales_return_no ILIKE :search OR
          c.customer_name ILIKE :search OR
          e.employee_name ILIKE :search OR
          i.product_description ILIKE :search OR
          i.product_sku_id ILIKE :search OR
          i.product_item_sku_id ILIKE :search OR
          i.invoice_no ILIKE :search
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
          sri.product_item_detail_id,
          sri.product_description,
          sri.quantity,
          sri.rate,
          sri.amount,
          sri.invoice_no,
          pid.sku_id AS product_item_sku_id,
          p.sku_id AS product_sku_id
        FROM sales_return_items sri
        LEFT JOIN "productItemDetails" pid ON sri.product_item_detail_id = pid.id AND pid.deleted_at IS NULL
        LEFT JOIN products p ON p.id = pid.product_id AND p.deleted_at IS NULL
        WHERE sri.deleted_at IS NULL
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

        i.product_item_detail_id,
        i.product_description,
        i.quantity,
        i.rate,
        i.amount,
        i.invoice_no,
        i.product_sku_id,
        i.product_item_sku_id,

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

        // 🔹 Pagination (ONLY if both provided)
        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        // 🔹 COUNT QUERY (FAST)
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
      AND oj.status != 'Cancelled'
    `;

        // 🔹 EXTRA FILTERS
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

        // Date filter
        extraWhere += dateFilter(
            { from_date, to_date, date_filter },
            "oj.date",
            replacements
        );

        // 🔹 SEARCH (AFTER JOINS)
        let searchClause = "";
        if (search) {
            searchClause = `
        AND (
          fo.old_jewel_code ILIKE :search OR
          c.customer_name ILIKE :search OR
          e.employee_name ILIKE :search OR
          mt.material_type ILIKE :search OR
          i.jewel_description ILIKE :search OR
          i.hsn_code ILIKE :search
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
          oji.material_type_id,
          oji.jewel_description,
          oji.hsn_code,
          oji.grs_weight,
          oji.dust_weight,
          oji.net_weight,
          oji.wastage,
          oji.rate,
          oji.amount
        FROM old_jewel_items oji
        WHERE oji.deleted_at IS NULL
      ),

     invoice_map AS (
        SELECT
            sa.reference_id AS old_jewel_id,
            sib.invoice_no
        FROM sales_invoice_adjustments sa
        JOIN sales_invoice_bills sib 
            ON sib.id = sa.sales_invoice_id
            AND sib.deleted_at IS NULL
            AND sib.status = 'Invoice'
            AND sib.is_active = true
        WHERE sa.deleted_at IS NULL
            AND sa.adjustment_type_id = '2'
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

        mt.material_type,

        i.jewel_description,
        i.hsn_code,
        i.grs_weight,
        i.wastage,
        i.dust_weight,
        i.net_weight,
        i.rate,
        i.amount,

        fo.total_amount,
        inv.invoice_no

      FROM filtered_old_jewels fo

      LEFT JOIN items i ON i.old_jewel_id = fo.id
      LEFT JOIN customers c ON c.id = fo.customer_id
      LEFT JOIN employees e ON e.id = fo.employee_id
      LEFT JOIN "materialTypes" mt ON mt.id = i.material_type_id
      LEFT JOIN invoice_map inv ON inv.old_jewel_id = fo.id

      WHERE 1=1
      ${searchClause}

      ORDER BY fo.date DESC
    `;

        // 🔹 Pagination (ONLY if both provided)
        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const [rows] = await sequelize.query(query, { replacements });

        let total = null;

        // 🔹 COUNT QUERY (FAST)
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

module.exports = {
    getSalesInvoiceReport,
    getSalesReturnReport,
    getOldJewelReport
}