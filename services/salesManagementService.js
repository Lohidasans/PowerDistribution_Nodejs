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
        const { branch_id, material_type_id, category_id, search } = req.query;

        const replacements = {};
        let filterSql = `WHERE sc.deleted_at IS NULL AND p.deleted_at IS NULL`;

        if (branch_id) {
            filterSql += ` AND p.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        if (material_type_id) {
            filterSql += ` AND p.material_type_id = :material_type_id`;
            replacements.material_type_id = material_type_id;
        }

        if (category_id) {
            filterSql += ` AND p.category_id = :category_id`;
            replacements.category_id = category_id;
        }

        if (search) {
            filterSql += `
        AND (
          sc.subcategory_name ILIKE :search
          OR c.category_name ILIKE :search
          OR mt.material_type ILIKE :search
          OR b.branch_name ILIKE :search
        )
      `;
            replacements.search = `%${search}%`;
        }

        const rows = await sequelize.query(
            `WITH sold_products AS (
                SELECT
                    sii.product_id,
                    SUM(sii.quantity) AS sold_qty
                FROM sales_invoice_bills sib
                JOIN sales_invoice_bill_items sii
                    ON sii.invoice_bill_id = sib.id
                    AND sii.deleted_at IS NULL
                WHERE sib.deleted_at IS NULL AND sib.status = 'Invoice'
                GROUP BY sii.product_id
            )
            SELECT
                b.branch_name,
                b.id AS branch_id,
                mt.material_type,
                p.material_type_id,
                c.id AS category_id,
                c.category_name,
                sc.id AS subcategory_id,
                sc.subcategory_name,

                -- total sold quantity
                SUM(sp.sold_qty) AS sold_quantity,

                -- how many products sold
                COUNT(DISTINCT sp.product_id) AS sold_product_count

            FROM sold_products sp
            JOIN products p ON p.id = sp.product_id
            JOIN subcategories sc ON sc.id = p.subcategory_id
            LEFT JOIN branches b ON b.id = p.branch_id
            LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
            LEFT JOIN categories c ON c.id = p.category_id
            ${filterSql}
            
            -- optional filters
            -- AND p.branch_id = :branch_id
            -- AND p.material_type_id = :material_type_id
            -- AND p.category_id = :category_id

            GROUP BY
            b.branch_name,
            b.id,
            mt.material_type,
            p.material_type_id,
            c.id,
            c.category_name,
            sc.id,
            sc.subcategory_name
            ORDER BY sold_quantity DESC
            `,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );


        return commonService.okResponse(res, { data: rows });
    } catch (error) {
        console.error("Low Stock Error", error);
        return commonService.handleError(res, error);
    }
};

module.exports = {
    getSalesReport,
    getFastMovingSubCategories
};
