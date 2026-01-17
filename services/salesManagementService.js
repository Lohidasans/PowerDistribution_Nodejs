const { sequelize } = require("../models");
const commonService = require("./commonService");
const REPORT_CONFIG = require("../helpers/configs/reportConfig");
const { dateFilter } = require("../helpers/dateHelper");

const getSalesReport = async (req, res) => {
    try {
        const {
            type ="estimate",
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

        // 🔒 Validate report type
        const config = REPORT_CONFIG[type];
        if (!config) {
            return commonService.badRequest(res, "Invalid report type");
        }

        /* ------------------ PAGINATION ------------------ */
        const finalPageSize = pageSize || limit;
        const hasPagination = page && finalPageSize;
        const perPage = hasPagination ? Number(finalPageSize) : null;
        const offset = hasPagination ? (page - 1) * perPage : null;

        /* ------------------ WHERE SQL ------------------ */
        const replacements = {};
        let whereSql = `1=1`;

        // Date filter
        whereSql += dateFilter(
            { from_date, to_date, date_filter },
            config.dateColumn,
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
          t.${config.codeColumn} ILIKE :search
          OR c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
        )
      `;
            replacements.search = `%${search}%`;
        }

        /* ------------------ SCORECARD ------------------ */
        const scorecardSql = `
      SELECT
        ${config.weightColumn
                ? `COALESCE(SUM(i.${config.weightColumn}),0)`
                : `0`
            } AS total_weight,
        ${config.quantityExpr} AS total_quantity
      FROM ${config.table} t
      LEFT JOIN ${config.itemTable} i
        ON i.${config.itemFk} = t.id
        AND i.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE ${whereSql}
    `;

        const [scorecard] = await sequelize.query(scorecardSql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        /* ------------------ GRID QUERY ------------------ */
        let gridSql = `
      SELECT
        t.*,
        b.branch_name,
        c.customer_name,
        c.mobile_number,
        ${config.weightColumn
                ? `COALESCE(items.total_weight,0)`
                : `0`
            } AS total_weight,
        COALESCE(items.quantity,0) AS quantity
      FROM ${config.table} t
      LEFT JOIN (
        SELECT
          ${config.itemFk} AS parent_id,
          ${config.weightColumn
                ? `SUM(${config.weightColumn})`
                : `0`
            } AS total_weight,
          ${config.quantityExpr} AS quantity
        FROM ${config.itemTable}
        WHERE deleted_at IS NULL
        GROUP BY ${config.itemFk}
      ) items ON items.parent_id = t.id
      LEFT JOIN customers c ON c.id = t.customer_id
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

        /* ------------------ PAGINATION COUNT ------------------ */
        let pagination = null;

        if (hasPagination) {
            const countSql = `
        SELECT COUNT(*)::int AS total
        FROM ${config.table} t
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

        /* ------------------ RESPONSE ------------------ */
        return commonService.okResponse(res, {
            scorecard: {
                total_weight: Number(scorecard.total_weight).toFixed(3),
                total_quantity: Number(scorecard.total_quantity)
            },
            data,
            pagination
        });

    } catch (error) {
        console.error("Report API Error:", error);
        return commonService.handleError(res, error);
    }
};

module.exports = { getSalesReport };
