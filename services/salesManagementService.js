const { sequelize } = require("../models");
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
            purity,
            search,
        } = req.query;

        const replacements = {
            branch_id: branch_id || null,
            vendor_id: vendor_id || null,
            material_type_id: material_type_id || null,
            category_id: category_id || null,
            subcategory_id: subcategory_id || null,
            purity: purity || null,
            search: search ? `%${search}%` : null,
        };

        const rows = await sequelize.query(
            `
      WITH filtered_products AS (
        SELECT
          p.id AS product_id,
          p.branch_id,
          p.vendor_id,
          p.material_type_id,
          p.purity,
          p.category_id,
          p.subcategory_id
        FROM products p
        WHERE p.deleted_at IS NULL
          AND (:branch_id IS NULL OR p.branch_id = :branch_id)
          AND (:vendor_id IS NULL OR p.vendor_id = :vendor_id)
          AND (:material_type_id IS NULL OR p.material_type_id = :material_type_id)
          AND (:category_id IS NULL OR p.category_id = :category_id)
          AND (:subcategory_id IS NULL OR p.subcategory_id = :subcategory_id)
          AND (:purity IS NULL OR p.purity = :purity)
      ),
      sold_products AS (
        SELECT
          fp.product_id,
          fp.branch_id,
          fp.subcategory_id,
          SUM(sii.quantity) AS sold_qty
        FROM filtered_products fp
        JOIN sales_invoice_bill_items sii
          ON sii.product_id = fp.product_id
          AND sii.deleted_at IS NULL
        JOIN sales_invoice_bills sib
          ON sib.id = sii.invoice_bill_id
          AND sib.deleted_at IS NULL
          AND sib.status = 'Invoice'
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
        p.purity,
        p.vendor_id,
        v.vendor_name,
        c.id AS category_id,
        c.category_name,
        sc.id AS subcategory_id,
        sc.subcategory_name,

        -- ✅ per branch + subcategory
        SUM(sp.sold_qty) AS sold_quantity,
        COUNT(DISTINCT sp.product_id) AS sold_product_count

      FROM sold_products sp
      JOIN products p ON p.id = sp.product_id
      JOIN subcategories sc ON sc.id = p.subcategory_id
      LEFT JOIN branches b ON b.id = p.branch_id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN vendors v ON v.id = p.vendor_id
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
          )
        `
                : ""
            }

      GROUP BY
        b.id,
        b.branch_name,
        mt.material_type,
        p.material_type_id,
        p.purity,
        p.vendor_id,
        v.vendor_name,
        c.id,
        c.category_name,
        sc.id,
        sc.subcategory_name

      ORDER BY sold_quantity DESC
      `,
            {
                replacements,
                type: sequelize.QueryTypes.SELECT,
            }
        );

        return commonService.okResponse(res, { data: rows });
    } catch (error) {
        console.error("Fast Moving Error", error);
        return commonService.handleError(res, error);
    }
};



module.exports = {
    getSalesReport,
    getFastMovingSubCategories
};
