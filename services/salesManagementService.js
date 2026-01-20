const { sequelize } = require("../models");
const { QueryTypes } = require("sequelize");
const commonService = require("./commonService");
const REPORT_CONFIG = require("../helpers/configs/reportConfig");
const { dateFilter } = require("../helpers/dateHelper");

// SCORECARD HELPER
const getScorecardByType = async ({ config, whereSql, replacements }) => {
    const sql = `
        SELECT
            COALESCE(weight.total_weight, 0) AS total_weight,
            COALESCE(weight.total_quantity, 0) AS total_quantity,
            COALESCE(amount.total_amount, 0) AS total_amount
        FROM (
            SELECT
                ${config.weightColumn
            ? `SUM(${config.weightColumn})`
            : `0`
        } AS total_weight,
                ${config.quantityExpr} AS total_quantity
            FROM ${config.table} t
            LEFT JOIN ${config.itemTable} i
                ON i.${config.itemFk} = t.id
                AND i.deleted_at IS NULL
            WHERE ${whereSql}
        ) weight
        CROSS JOIN (
            SELECT
                SUM(t.total_amount) AS total_amount
            FROM ${config.table} t
            WHERE ${whereSql}
        ) amount
    `;

    const [row] = await sequelize.query(sql, {
        replacements,
        type: sequelize.QueryTypes.SELECT
    });

    return row;
};


const resolveWeightExpr = (weightColumn) => {
    if (!weightColumn) return "0";

    // if SQL expression like CAST(...)
    if (weightColumn.includes("(")) {
        return weightColumn;
    }

    // normal column
    return `i.${weightColumn}`;
};

// MAIN API
const getSalesReport = async (req, res) => {
    try {
        const {
            type = "estimate",
            branch_id,
            from_date,
            to_date,
            date_filter,
            search,
            status,
            page,
            pageSize,
            limit
        } = req.query;

        // Validate grid report typeq
        const gridConfig = REPORT_CONFIG[type];
        if (!gridConfig) {
            return commonService.badRequest(res, "Invalid report type");
        }

        /* ---------------- PAGINATION ---------------- */
        const finalPageSize = pageSize || limit;
        const hasPagination = page && finalPageSize;
        const perPage = hasPagination ? Number(finalPageSize) : null;
        const offset = hasPagination ? (page - 1) * perPage : null;

        /* ---------------- WHERE SQL ---------------- */
        const replacements = {};
        let whereSql = `1=1`;

        whereSql += dateFilter(
            { from_date, to_date, date_filter },
            gridConfig.dateColumn,
            replacements
        );

        if (status) {
            whereSql += ` AND t.status = :status`;
            replacements.status = status;
        }

        if (branch_id) {
            whereSql += ` AND t.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        if (search) {
            whereSql += `
        AND (
          t.${gridConfig.codeColumn} ILIKE :search
          OR c.customer_name ILIKE :search
          OR e.employee_name ILIKE :search
        )
      `;
            replacements.search = `%${search}%`;
        }

        /* ---------------- SCORECARDS (ALL TYPES) ---------------- */
        const scorecard = {};

        for (const reportType of Object.keys(REPORT_CONFIG)) {
            scorecard[reportType] = await getScorecardByType({
                config: REPORT_CONFIG[reportType],
                whereSql,
                replacements
            });
        }

        /* ---------------- GRID QUERY (SELECTED TYPE) ---------------- */
        let gridSql = `
        SELECT
            t.*,
            b.branch_name,
            c.customer_name,
            e.employee_name,
            c.mobile_number,
            ${gridConfig.weightColumn
                        ? `COALESCE(items.total_weight, 0)`
                        : `0`
                    } AS total_weight,
            COALESCE(items.quantity, 0) AS quantity,
            COALESCE(t.total_amount, 0) AS total_amount
        FROM ${gridConfig.table} t
        LEFT JOIN (
            SELECT
                i.${gridConfig.itemFk} AS parent_id,
                ${gridConfig.weightColumn
                        ? `SUM(${resolveWeightExpr(gridConfig.weightColumn)})`
                        : `0`
                    } AS total_weight,
                ${gridConfig.quantityExpr} AS quantity
            FROM ${gridConfig.itemTable} i
            WHERE i.deleted_at IS NULL
            GROUP BY i.${gridConfig.itemFk}
        ) items ON items.parent_id = t.id
        LEFT JOIN customers c ON c.id = t.customer_id
        LEFT JOIN employees e ON e.id = t.employee_id
        LEFT JOIN branches b ON b.id = t.branch_id
        WHERE ${whereSql}
        ORDER BY t.id DESC
        `;


        if (hasPagination) {
            gridSql += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = perPage;
            replacements.offset = offset;
        }

        const data = await sequelize.query(gridSql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        /* ---------------- PAGINATION ---------------- */
        let pagination = null;

        if (hasPagination) {
            const countSql = `
        SELECT COUNT(*)::int AS total
        FROM ${gridConfig.table} t
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE ${whereSql}
      `;

            const [{ total }] = await sequelize.query(countSql, {
                replacements,
                type: sequelize.QueryTypes.SELECT
            });

            pagination = {
                total,
                page: Number(page),
                pageSize: perPage,
                totalPages: Math.ceil(total / perPage)
            };
        }

        /* ---------------- RESPONSE ---------------- */
        return commonService.okResponse(res, {
            scorecard,
            data,
            pagination
        });

    } catch (error) {
        console.error("Sales Report Error:", error);
        return commonService.handleError(res, error);
    }
};

// get the sold out product based on its subcategory
const getFastMovingSubCategories = async (req, res) => {
    try {
        const {
            branch_id,
            vendor_id,
            material_type_id,
            category_id,
            subcategory_id,
            search,
            from_date,
            to_date,
            date_filter,
        } = req.query;

        const replacements = {
            branch_id: branch_id || null,
            vendor_id: vendor_id || null,
            material_type_id: material_type_id || null,
            category_id: category_id || null,
            subcategory_id: subcategory_id || null,
            search: search ? `%${search}%` : null,
        };

        // Date filter must be applied on SALES (invoice date)
        const dateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "sib.created_at", // <-- THIS IS THE CORRECT DATE
            replacements
        );

        const rows = await sequelize.query(
            `
      WITH filtered_products AS (
        SELECT
          p.id AS product_id,
          p.branch_id,
          p.material_type_id,
          p.category_id,
          p.subcategory_id
        FROM products p
        WHERE p.deleted_at IS NULL
          AND (:branch_id IS NULL OR p.branch_id = :branch_id)
          AND (:vendor_id IS NULL OR p.vendor_id = :vendor_id)
          AND (:material_type_id IS NULL OR p.material_type_id = :material_type_id)
          AND (:category_id IS NULL OR p.category_id = :category_id)
          AND (:subcategory_id IS NULL OR p.subcategory_id = :subcategory_id)
      ),
      sold_products AS (
        SELECT
          fp.product_id,
          fp.branch_id,
          fp.subcategory_id,
          SUM(sii.quantity) AS sold_qty,
          SUM(COALESCE(sii.gross_weight, 0)) AS total_gross_weight

        FROM filtered_products fp
        JOIN sales_invoice_bill_items sii
          ON sii.product_id = fp.product_id
          AND sii.deleted_at IS NULL
        JOIN sales_invoice_bills sib
          ON sib.id = sii.invoice_bill_id
          AND sib.deleted_at IS NULL
          AND sib.status = 'Invoice'
          ${dateCondition}
        GROUP BY
          fp.product_id,
          fp.branch_id,
          fp.subcategory_id
      )
      SELECT
        b.id AS branch_id,
        b.branch_name,
        mt.material_type,
        p.material_type_id,
        c.id AS category_id,
        c.category_name,
        sc.id AS subcategory_id,
        sc.subcategory_name,

        --  Final aggregation per BRANCH + SUBCATEGORY
        SUM(sp.sold_qty) AS sold_quantity,
        SUM(sp.total_gross_weight) AS total_gross_weight,
        COUNT(DISTINCT sp.product_id) AS sold_product_count

      FROM sold_products sp
      JOIN products p ON p.id = sp.product_id
      JOIN subcategories sc ON sc.id = p.subcategory_id
      LEFT JOIN branches b ON b.id = p.branch_id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories c ON c.id = p.category_id

      WHERE sc.deleted_at IS NULL
        AND p.deleted_at IS NULL
        ${search
                ? `
          AND (
            sc.subcategory_name ILIKE :search
            OR c.category_name ILIKE :search
            OR mt.material_type ILIKE :search
            OR b.branch_name ILIKE :search
          )` : "" }

      GROUP BY
        b.id,
        b.branch_name,
        mt.material_type,
        p.material_type_id,
        c.id,
        c.category_name,
        sc.id,
        sc.subcategory_name

      ORDER BY sold_quantity DESC
      `,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        return commonService.okResponse(res, { data: rows });
    } catch (error) {
        console.error("Fast Moving Error", error);
        return commonService.handleError(res, error);
    }
};

const getFastMovingSoldProducts = async (req, res) => {
    try {
        const {
            branch_id,
            subcategory_id,
            vendor_id,  
            purity,
            category_id, 
            material_type_id,
            search,
            from_date,
            to_date,
            date_filter,
        } = req.query;

        if (!branch_id || !subcategory_id) {
            return commonService.badRequest(
                res,
                "branch_id and subcategory_id are required"
            );
        }

        const replacements = {
            branch_id,
            subcategory_id,
            vendor_id: vendor_id || null,
            purity: purity || null,
            category_id: category_id || null,
            material_type_id: material_type_id || null,
            search: search ? `%${search}%` : null,
        };

        // Date filter is STILL on sales (correct)
        const dateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "sib.created_at",
            replacements
        );

        const rows = await sequelize.query(
            `
      SELECT
        v.vendor_name,
        v.vendor_code,
        v.vendor_image_url,
        v.id AS vendor_id,

        p.sku_id AS product_sku_id,

        mt.material_type,
        mt.id as material_type_id,
        c.category_name,
        c.id as category_id,
        sc.subcategory_name,
        sc.id as subcategory_id,
        p.product_name,
        p.purity,
        p.id as product_id,
        p.hsn_code,
        p.image_urls as product_images,

        pid.variation,
        pid.id as product_item_detail_id,
        pid.sku_id AS sku_id,
        sii.quantity,
        sii.net_weight,
        sii.gross_weight,
        sib.invoice_date,
        sib.invoice_no

      FROM sales_invoice_bill_items sii
      JOIN sales_invoice_bills sib
        ON sib.id = sii.invoice_bill_id
        AND sib.deleted_at IS NULL
        AND sib.status = 'Invoice'
        ${dateCondition}

      -- BRANCH FILTER COMES FROM PRODUCTS
      JOIN products p
        ON p.id = sii.product_id
        AND p.deleted_at IS NULL
        AND p.subcategory_id = :subcategory_id
        AND p.branch_id = :branch_id
        AND (:vendor_id IS NULL OR p.vendor_id = :vendor_id)
        AND (:purity IS NULL OR p.purity = :purity)
        AND (:category_id IS NULL OR p.category_id = :category_id)
        AND (:material_type_id IS NULL OR p.material_type_id = :material_type_id)

      -- optional item-level data
      LEFT JOIN "productItemDetails" pid
        ON pid.id = sii.product_item_detail_id
        AND pid.deleted_at IS NULL

      LEFT JOIN vendors v ON v.id = p.vendor_id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id

      WHERE sii.deleted_at IS NULL
        ${search
                ? `
          AND (
            p.product_name ILIKE :search
            OR pid.sku_id ILIKE :search
            OR p.sku_id ILIKE :search
            OR v.vendor_name ILIKE :search
          )` : ""
            }

      ORDER BY sib.invoice_date DESC, p.product_name`,
            {
                replacements,
                type: QueryTypes.SELECT,
            });

        // Group by product_id
        const groupedMap = new Map();

        for (const row of rows) {
            const key = row.product_id;

            if (!groupedMap.has(key)) {
                groupedMap.set(key, {
                    vendor_image: row.vendor_image_url,
                    vendor_code: row.vendor_code,
                    vendor_name: row.vendor_name,
                    vendor_id: row.vendor_id,

                    product_sku_id: row.product_sku_id,
                    branch_id: branch_id,
                    hsn_code: row.hsn_code,
                    product_name: row.product_name,
                    product_images: row.product_images,
                    purity: row.purity,

                    material_type: row.material_type,
                    material_type_id: row.material_type_id,
                    category_name: row.category_name,
                    category_id: row.category_id,
                    subcategory_name: row.subcategory_name,
                    subcategory_id: row.subcategory_id,

                    sku_id: row.sku_id,
                    purity: row.purity,
                    product_id: row.product_id,

                    variation_count: 0,
                    itemDetails: [],
                });
            }

            const product = groupedMap.get(key);

            // ALWAYS item-level
            product.itemDetails.push({
                id: row.product_item_detail_id,
                product_id: row.product_id,
                sku_id: row.sku_id,
                variation: row.variation || "{}",
                gross_weight: row.gross_weight,
                net_weight: row.net_weight,
                quantity: row.quantity,
                invoice_date: row.invoice_date,
                invoice_no: row.invoice_no,
            });
        }

        // calculate variation count
        const finalData = Array.from(groupedMap.values()).map(product => ({
            ...product,
            variation_count: product.itemDetails.length,
        }));

        return commonService.okResponse(res, {
            data: finalData,
        });
    } catch (error) {
        console.error("Fast Moving Sold Products Error", error);
        return commonService.handleError(res, error);
    }
};

const getTopBuyingCustomers = async (req, res) => {
    try {
        const {
            date_filter,
            from_date,
            to_date,
            page,
            page_size,
        } = req.query;

        const replacements = {};

        const dateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "sib.created_at",
            replacements
        );

        // Pagination logic (ONLY if provided)
        let paginationSql = "";

        if (page && page_size) {
            const limit = Number(page_size);
            const offset = (Number(page) - 1) * limit;

            paginationSql = ` LIMIT :limit OFFSET :offset `;
            replacements.limit = limit;
            replacements.offset = offset;
        }

        const rows = await sequelize.query(
            `
            SELECT
                c.id AS customer_id,
                c.customer_code,
                c.customer_name,
                c.mobile_number,

                COUNT(DISTINCT sib.id) AS no_of_orders,
                SUM(sib.total_amount) AS purchase_amount

                FROM sales_invoice_bills sib
                JOIN customers c
                ON c.id = sib.customer_id
                AND c.deleted_at IS NULL

                WHERE sib.deleted_at IS NULL
                AND sib.status = 'Invoice'
                ${dateCondition}

                GROUP BY
                c.id,
                c.customer_code,
                c.customer_name,
                c.mobile_number

                ORDER BY purchase_amount DESC
            ${paginationSql}
            `,
                    {
                        replacements,
                        type: QueryTypes.SELECT,
                    }
                );
        return commonService.okResponse(res, {
            data: rows,
        });
    } catch (error) {
        console.error("Top Buying Customer Error", error);
        return commonService.handleError(res, error);
    }
};

module.exports = { getTopBuyingCustomers };


module.exports = {
    getSalesReport,
    getFastMovingSubCategories,
    getFastMovingSoldProducts,
    getTopBuyingCustomers
};
