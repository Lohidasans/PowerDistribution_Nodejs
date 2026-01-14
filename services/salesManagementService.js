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
            date_filter,
            search,
            status,
            page,
            pageSize,
            limit
        } = req.query;

        // VALIDATION
        if (!["old_jewel", "jewel_repair"].includes(type)) {
            return commonService.badRequest(res, "Invalid report type");
        }

        // PAGINATION
        const finalPageSize = pageSize || limit;
        const hasPagination = page && finalPageSize;
        const perPage = hasPagination ? Number(finalPageSize) : null;
        const offset = hasPagination ? (page - 1) * perPage : null;

        const replacements = {};
        let whereSql = `1=1`;

        // DATE FILTER
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const todayStr = `${yyyy}-${mm}-${dd}`;

        let autoFromDate = null;
        let autoToDate = todayStr;

        if (date_filter) {
            if (date_filter === "today") autoFromDate = todayStr;
            if (date_filter === "week") {
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                autoFromDate = new Date(today.setDate(diff)).toISOString().split("T")[0];
            }
            if (date_filter === "month") autoFromDate = `${yyyy}-${mm}-01`;
            if (date_filter === "year") autoFromDate = `${yyyy}-01-01`;
        }

        const finalFromDate = from_date || autoFromDate;
        const finalToDate = to_date || autoToDate;

        if (finalFromDate && finalToDate) {
            whereSql += ` AND t.date BETWEEN :from_date AND :to_date`;
            replacements.from_date = finalFromDate;
            replacements.to_date = finalToDate;
        }

        if (status) {
            whereSql += ` AND t.status = :status`;
            replacements.status = status;
        }

        if (branch_id) {
            whereSql += ` AND t.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        // SEARCH SQL (SPLIT SAFELY)
        const oldJewelSearchSql = search
            ? ` AND (
          t.old_jewel_code ILIKE :search
          OR c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
        )`
            : ``;

        const repairSearchSql = search
            ? ` AND (
          t.repair_code ILIKE :search
          OR c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
        )`
            : ``;

        if (search) replacements.search = `%${search}%`;

        // SCORECARDS
        const [oldJewelCard] = await sequelize.query(
            `
      SELECT
        COALESCE(SUM(oi.net_weight),0) AS total_weight,
        COUNT(oi.id) AS total_quantity
      FROM old_jewels t
      JOIN old_jewel_items oi ON oi.old_jewel_id = t.id AND oi.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE ${whereSql}
      ${oldJewelSearchSql}
      `,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        const [repairCard] = await sequelize.query(
            `
      SELECT
        COALESCE(SUM(ri.weight),0) AS total_weight,
        COUNT(ri.id) AS total_quantity
      FROM jewel_repairs t
      JOIN jewel_repair_items ri ON ri.repair_id = t.id AND ri.deleted_at IS NULL
      LEFT JOIN customers c ON c.id = t.customer_id
      WHERE ${whereSql}
      ${repairSearchSql}
      `,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        // CONFIG BY TYPE
        const config = type === "jewel_repair"
            ? {
                table: "jewel_repairs",
                itemTable: "jewel_repair_items",
                itemFk: "repair_id",
                weight: "weight",
                code: "repair_code"
            }
            : {
                table: "old_jewels",
                itemTable: "old_jewel_items",
                itemFk: "old_jewel_id",
                weight: "net_weight",
                code: "old_jewel_code"
            };

        // MATERIAL FILTER
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

        // GRID QUERY
        let gridSql = `
      SELECT
        t.*,
        b.branch_name,
        c.customer_name,
        c.mobile_number,
        COALESCE(items.total_weight,0) AS total_net_weight,
        COALESCE(items.qty,0) AS quantity,
        items.material_type_id,
        items.material_type
      FROM ${config.table} t
      LEFT JOIN (
        SELECT
          i.${config.itemFk} AS parent_id,
          SUM(i.${config.weight}) AS total_weight,
          COUNT(i.id) AS qty,
          MAX(i.material_type_id) AS material_type_id,
          MAX(mt.material_type) AS material_type
        FROM ${config.itemTable} i
        LEFT JOIN "materialTypes" mt ON mt.id = i.material_type_id AND mt.deleted_at IS NULL
        WHERE i.deleted_at IS NULL
        GROUP BY i.${config.itemFk}
      ) items ON items.parent_id = t.id
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN branches b ON b.id = t.branch_id
      WHERE ${whereSql}
      ${search ? ` AND (
        t.${config.code} ILIKE :search
        OR c.customer_name ILIKE :search
        OR c.mobile_number ILIKE :search
      )` : ""}
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

        // PAGINATION COUNT
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
                old_jewel: {
                    total_weight: Number(oldJewelCard.total_weight).toFixed(3),
                    total_quantity: Number(oldJewelCard.total_quantity)
                },
                jewel_repair: {
                    total_weight: Number(repairCard.total_weight).toFixed(3),
                    total_quantity: Number(repairCard.total_quantity)
                }
            },
            data,
            pagination
        });

    } catch (error) {
        console.error("Old Jewel Report Error:", error);
        return commonService.handleError(res, error);
    }
};