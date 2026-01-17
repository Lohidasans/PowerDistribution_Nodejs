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


const getStockAgeingReport = async (req, res) => {
    try {
        const {
            material_type_id,
            category_id,
            subcategory_id,
            grn_id,
            ref_no_id,
            search,
            branch_id,
            ageing,    // 0_30 | 31_60 | 61_90 | 91_plus
            page,
            limit
        } = req.query;

        const usePagination = page && limit;
        const offset = usePagination ? (page - 1) * limit : null;

        const replacements = {};
        let whereSql = `
      WHERE p.status = 'Active'
      AND p.deleted_at IS NULL
      AND pid.quantity > 0
      AND pid.deleted_at IS NULL
    `;

        if (material_type_id) {
            whereSql += ` AND p.material_type_id = :material_type_id`;
            replacements.material_type_id = material_type_id;
        }

        if (category_id) {
            whereSql += ` AND p.category_id = :category_id`;
            replacements.category_id = category_id;
        }

        if (subcategory_id) {
            whereSql += ` AND p.subcategory_id = :subcategory_id`;
            replacements.subcategory_id = subcategory_id;
        }

        if (grn_id) {
            whereSql += ` AND p.grn_id = :grn_id`;
            replacements.grn_id = grn_id;
        }

        if (ref_no_id) {
            whereSql += ` AND p.ref_no_id = :ref_no_id`;
            replacements.ref_no_id = ref_no_id;
        }

        if (branch_id) {
            whereSql += ` AND p.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        if (search) {
            replacements.search = `%${search}%`;
            whereSql += `
        AND (
          p.product_name ILIKE :search
          OR p.sku_id ILIKE :search
          OR mt.material_type ILIKE :search
          OR b.branch_name ILIKE :search
        )
      `;
        }

        // AGEING FILTER
        let ageingSql = ``;

        if (ageing === "0_30") ageingSql = ` AND (CURRENT_DATE - p.created_at::date) <= 30`;
        if (ageing === "31_60") ageingSql = ` AND (CURRENT_DATE - p.created_at::date) BETWEEN 31 AND 60`;
        if (ageing === "61_90") ageingSql = ` AND (CURRENT_DATE - p.created_at::date) BETWEEN 61 AND 90`;
        if (ageing === "91_plus") ageingSql = ` AND (CURRENT_DATE - p.created_at::date) >= 91`;

        // SCORE CARDS
        const scoreRows = await sequelize.query(
            `
      SELECT
        CASE
          WHEN (CURRENT_DATE - p.created_at::date) <= 30 THEN '0_30'
          WHEN (CURRENT_DATE - p.created_at::date) BETWEEN 31 AND 60 THEN '31_60'
          WHEN (CURRENT_DATE - p.created_at::date) BETWEEN 61 AND 90 THEN '61_90'
          ELSE '91_plus'
        END AS bucket,
        SUM(pid.quantity * pid.net_weight) AS total_weight,
        SUM(pid.quantity) AS total_quantity
      FROM products p
      JOIN "productItemDetails" pid ON pid.product_id = p.id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN branches b ON b.id = p.branch_id
      ${whereSql}
      GROUP BY bucket
      `,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        const cards = {
            "0_30": { weight: 0, qty: 0 },
            "31_60": { weight: 0, qty: 0 },
            "61_90": { weight: 0, qty: 0 },
            "91_plus": { weight: 0, qty: 0 }
        };

        scoreRows.forEach(r => {
            cards[r.bucket].weight = parseFloat(r.total_weight || 0).toFixed(3);
            cards[r.bucket].qty = Number(r.total_quantity || 0);
        });

        // GRID
        let gridSql = `
        SELECT
        p.id,
        p.product_name,
        p.sku_id,
        p.material_type_id,
        p.category_id,
        p.subcategory_id,
        p.branch_id,
        p.vendor_id,
        p.purity,
        p.created_at,
        p.ref_no_id,

        p.grn_id,
        g.grn_no,

        gi.ref_no AS grn_ref_no,

        mt.material_type,
        ct.category_name,
        sc.subcategory_name,
        b.branch_name,

        SUM(pid.quantity) AS quantity,
        SUM(pid.quantity * pid.net_weight) AS total_weight,
        (CURRENT_DATE - p.created_at::date) AS age_days,

        JSON_AGG(
            JSON_BUILD_OBJECT(
            'id', pid.id,
            'product_id', pid.product_id,
            'sku_id', p.sku_id,
            'quantity', pid.quantity,
            'net_weight', pid.net_weight
            ) ORDER BY pid.id
        ) AS itemDetails

        FROM products p
        JOIN "productItemDetails" pid ON pid.product_id = p.id
        LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
        LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
        LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
        LEFT JOIN categories ct ON ct.id = p.category_id
        LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
        LEFT JOIN branches b ON b.id = p.branch_id

        ${whereSql}
        ${ageingSql}

        GROUP BY
        p.id, g.grn_no,
        gi.ref_no,
        mt.material_type,
        ct.category_name,
        sc.subcategory_name,
        b.branch_name
        ORDER BY p.id DESC
        `;


        if (usePagination) {
            gridSql += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = Number(limit);
            replacements.offset = offset;
        }

        const data = await sequelize.query(gridSql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        return commonService.okResponse(res, {
            cards,
            data
        });

    } catch (error) {
        console.error("Stock Ageing Error:", error);
        return commonService.handleError(res, error);
    }
};

const getAllStockDetails = async (req, res) => {
    try {
        const {
            material_type_id,
            category_id,
            subcategory_id,
            grn_id,
            ref_no_id,
            search,
            branch_id,
            page,
            limit,
        } = req.query;

        const usePagination = page !== undefined || limit !== undefined;
        const pageNum = usePagination ? parseInt(page || 1, 10) : null;
        const limitNum = usePagination ? parseInt(limit || 10, 10) : null;
        const offset = usePagination ? (pageNum - 1) * limitNum : null;

        let whereClause = `WHERE p.status = 'Active' AND p.deleted_at IS NULL`;

        const replacements = {};

        if (material_type_id) {
            whereClause += ` AND p.material_type_id = :material_type_id`;
            replacements.material_type_id = +material_type_id;
        }

        if (category_id) {
            whereClause += ` AND p.category_id = :category_id`;
            replacements.category_id = +category_id;
        }

        if (branch_id) {
            whereClause += ` AND p.branch_id = :branch_id`;
            replacements.branch_id = +branch_id;
        }

        if (subcategory_id) {
            whereClause += ` AND p.subcategory_id = :subcategory_id`;
            replacements.subcategory_id = +subcategory_id;
        }

        if (grn_id) {
            whereClause += ` AND p.grn_id = :grn_id`;
            replacements.grn_id = +grn_id;
        }

        if (ref_no_id) {
            whereClause += ` AND p.ref_no_id = :ref_no_id`;
            replacements.ref_no_id = +ref_no_id;
        }
        // Stock filter (only quantity > 0)
        whereClause += ` AND EXISTS ( SELECT 1 FROM "productItemDetails" pid_stock WHERE pid_stock.product_id = p.id
        AND pid_stock.quantity > 0 AND pid_stock.deleted_at IS NULL )`;

        if (search) {
            const like = `%${search}%`;
            whereClause += `AND (
          p.product_name ILIKE :like OR
          p.product_code ILIKE :like OR
          p.sku_id ILIKE :like OR
          p.description ILIKE :like OR
          p.hsn_code ILIKE :like OR
          mt.material_type ILIKE :like OR
          b.branch_name ILIKE :like OR
          g.grn_no ILIKE :like OR
          gi.ref_no ILIKE :like)`;
            replacements.like = like;
        }

        // -------- COUNT --------
        let total = null;
        if (usePagination) {
            const countQuery = `
        SELECT COUNT(DISTINCT p.id) AS total
        FROM products p
        LEFT JOIN "productItemDetails" pid ON pid.product_id = p.id
        LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
        LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
        LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
        LEFT JOIN categories ct ON ct.id = p.category_id
        LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
        LEFT JOIN branches b ON b.id = p.branch_id
        ${whereClause}`;

            const [countResult] = await sequelize.query(countQuery, { replacements });
            total = Number(countResult[0]?.total || 0);
        }

        // -------- MAIN QUERY --------
        let query = `
        SELECT
            p.id,
            p.product_code,
            p.product_name,
            p.description,
            p.is_published,
            p.image_urls,
            p.qr_image_url,
            p.vendor_id,
            p.material_type_id,
            p.category_id,
            ct.category_name,
            ct.category_image_url,
            p.subcategory_id,
            sc.subcategory_name,
            p.ref_no_id,
            p.grn_id,
            g.grn_no,
            gi.ref_no AS grn_ref_no,
            mt.material_type,
            mt.material_price,
            COALESCE(SUM(COALESCE(pid.quantity, 0)), 0) AS total_quantity,
            COALESCE(SUM(COALESCE(pid.quantity, 0) * COALESCE(pid.net_weight, 0)), 0) AS total_weight,
            COUNT(DISTINCT pid.id) AS variation_count,
            p.branch_id,
            b.branch_name,
            p.sku_id,
            p.hsn_code,
            p.purity,
            p.product_type,
            p.variation_type,
            p.product_variations,
            p.created_at,
            p.updated_at
        FROM products p
        LEFT JOIN "productItemDetails" pid ON pid.product_id = p.id
        LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
        LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
        LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
        LEFT JOIN categories ct ON ct.id = p.category_id
        LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
        LEFT JOIN branches b ON b.id = p.branch_id
        ${whereClause}
        GROUP BY
            p.id, mt.material_type, mt.material_price,
            ct.category_name, ct.category_image_url,
            sc.subcategory_name, g.grn_no, gi.ref_no, b.branch_name
        ORDER BY p.id DESC`;

        if (usePagination) {
            query += ` LIMIT :limit OFFSET :offset`;
        }

        const [rows] = await sequelize.query(query, {
            replacements: {
                ...replacements,
                ...(usePagination ? { limit: limitNum, offset } : {}),
            },
        });

        let products = rows;

        // -------- ITEM DETAILS --------
        if (products.length) {
            const productIds = products.map(p => p.id);

            const itemDetails = await models.ProductItemDetail.findAll({
                where: {
                    product_id: productIds,
                    quantity: { [Op.gt]: 0 },
                },
                order: [["id", "ASC"]],
            });

            const itemsByProduct = itemDetails.reduce((acc, item) => {
                (acc[item.product_id] ??= []).push(item);
                return acc;
            }, {});

            products = products.map(product => ({
                ...product,
                item_details: itemsByProduct[product.id] || [],
            }));
        }

        const response = { products };

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
        return commonService.handleError(res, err);
    }
};

const getLowStockSummary = async (req, res) => {
    try {
        const { branch_id, material_type_id, category_id, search } = req.query;

        const replacements = {};
        let filterSql = `WHERE sc.deleted_at IS NULL`;

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
            `
      WITH product_stock AS (
        SELECT
          p.id AS product_id,
          p.subcategory_id,
          SUM(pid.quantity) AS total_qty
        FROM products p
        JOIN "productItemDetails" pid 
          ON pid.product_id = p.id 
          AND pid.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.id, p.subcategory_id
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
        sc.reorder_level,
        COUNT(ps.product_id) AS low_stock_count
      FROM subcategories sc
      JOIN products p ON p.subcategory_id = sc.id
      JOIN product_stock ps ON ps.product_id = p.id
      LEFT JOIN branches b ON b.id = p.branch_id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories c ON c.id = p.category_id
      ${filterSql}
      AND ps.total_qty < sc.reorder_level
      GROUP BY
        b.branch_name,
        mt.material_type,
        c.category_name,
        b.id,
        p.material_type_id,
        c.id,
        sc.id,
        sc.subcategory_name,
        sc.reorder_level
      ORDER BY low_stock_count DESC
      `,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        return commonService.okResponse(res, { data: rows });
    } catch (error) {
        console.error("Low Stock Error", error);
        return commonService.handleError(res, error);
    }
};

const getOutOfStockSummary = async (req, res) => {
    try {
        const { branch_id, material_type_id, category_id, subcategory_id, search } = req.query;

        const replacements = {};
        let filterSql = `WHERE sc.deleted_at IS NULL`;

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
        
        if (subcategory_id) {
            filterSql += ` AND p.subcategory_id = :subcategory_id`;
            replacements.subcategory_id = subcategory_id;
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
            `
      WITH product_stock AS (
        SELECT
          p.id AS product_id,
          p.subcategory_id,
          SUM(pid.quantity) AS total_qty
        FROM products p
        JOIN "productItemDetails" pid
          ON pid.product_id = p.id
          AND pid.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.id, p.subcategory_id
      )
      SELECT
        p.branch_id,
        b.branch_name,
        p.material_type_id,
        mt.material_type,
        p.category_id,
        c.category_name,
        sc.id AS subcategory_id,
        sc.subcategory_name,
        COUNT(p.id) AS product_count,
        MAX(ps.total_qty) AS quantity
      FROM subcategories sc
      JOIN products p 
        ON p.subcategory_id = sc.id
        AND p.deleted_at IS NULL
      JOIN product_stock ps 
        ON ps.product_id = p.id
      LEFT JOIN branches b ON b.id = p.branch_id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories c ON c.id = p.category_id
      ${filterSql}
      GROUP BY
        p.branch_id,
        p.category_id,
        p.material_type_id,
        b.branch_name,
        mt.material_type,
        c.category_name,
        sc.id,
        sc.subcategory_name
      HAVING COUNT(p.id) > 0
      AND MAX(ps.total_qty) = 0
      ORDER BY sc.subcategory_name
      `,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        return commonService.okResponse(res, { data: rows });
    } catch (error) {
        console.error("Out of Stock Error:", error);
        return commonService.handleError(res, error);
    }
};

module.exports = {
    getOldJewelReport,
    getStockAgeingReport,
    getAllStockDetails,
    getLowStockSummary,
    getOutOfStockSummary,
};
