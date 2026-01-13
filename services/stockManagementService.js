const { Op } = require('sequelize');
const commonService = require('./commonService');
const { models, sequelize } = require('../models/index');


const getOldJewelReport = async (req, res) => {
    try {
        const {
            type = "old_jewel",
            branch_id,
            material_type_id,
            from_date,
            to_date,
            search,
            status,
            page,
            pageSize,
            limit
        } = req.query;

        const finalPageSize = pageSize || limit;
        const hasPagination = page && finalPageSize;

        const perPage = hasPagination ? Number(finalPageSize) : null;
        const offset = hasPagination ? (page - 1) * perPage : null;

        const replacements = {};
        let whereSql = `1=1`;

        if (status) {
            whereSql += ` AND t.status = :status`;
            replacements.status = status;
        }

        if (branch_id) {
            whereSql += ` AND t.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        if (from_date && to_date) {
            whereSql += ` AND t.date BETWEEN :from_date AND :to_date`;
            replacements.from_date = from_date;
            replacements.to_date = to_date;
        }

        const codeField = type === "jewel_repair" ? "repair_code" : "old_jewel_code";

        if (search) {
            whereSql += `
        AND (
          t.${codeField} ILIKE :search
          OR c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
        )
      `;
            replacements.search = `%${search}%`;
        }

        const config = type === "jewel_repair"
            ? {
                table: "jewel_repairs",
                itemTable: "jewel_repair_items",
                itemFk: "repair_id",
                weight: "net_weight"
            }
            : {
                table: "old_jewels",
                itemTable: "old_jewel_items",
                itemFk: "old_jewel_id",
                weight: "net_weight"
            };

        if (material_type_id) {
            whereSql += `
        AND EXISTS (
          SELECT 1
          FROM ${config.itemTable} i
          WHERE i.${config.itemFk} = t.id
          AND i.material_type_id = :material_type_id
          AND i.deleted_at IS NULL
        )
      `;
            replacements.material_type_id = material_type_id;
        }

        // ---------------- SCORECARD (FULL DATASET) ----------------
        const [scorecard] = await sequelize.query(
            `
      SELECT
        COALESCE(SUM(i.${config.weight}),0) AS total_weight,
        COUNT(i.id) AS total_quantity
      FROM ${config.table} t
      JOIN ${config.itemTable} i
        ON i.${config.itemFk} = t.id AND i.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE ${whereSql}
      `,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        // ---------------- GRID DATA ----------------
        let gridSql = `
      SELECT
        t.*,
        b.branch_name,
        c.customer_name,
        c.mobile_number,

        COALESCE(items.total_net_weight, 0) AS total_net_weight,
        COALESCE(items.quantity, 0) AS quantity

      FROM ${config.table} t

      LEFT JOIN (
        SELECT
          ${config.itemFk} AS parent_id,
          SUM(${config.weight}) AS total_net_weight,
          COUNT(id) AS quantity
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

        // ---------------- PAGINATION META ----------------
        let pagination = null;

        if (hasPagination) {
            const [{ total }] = await sequelize.query(
                `
        SELECT COUNT(*)::int AS total
        FROM ${config.table} t
        LEFT JOIN customers c ON c.id = t.customer_id
        WHERE ${whereSql}
        `,
                { replacements, type: sequelize.QueryTypes.SELECT }
            );

            pagination = {
                total,
                page: Number(page),
                pageSize: perPage,
                totalPages: Math.ceil(total / perPage)
            };
        }

        return commonService.okResponse(res, {
            scorecard: {
                total_weight: parseFloat(scorecard.total_weight).toFixed(3),
                total_quantity: Number(scorecard.total_quantity)
            },
            data,
            pagination
        });

    } catch (error) {
        console.error("Old Jewel Report Error:", error);
        return commonService.handleError(res, error);
    }
};




module.exports = { getOldJewelReport };
