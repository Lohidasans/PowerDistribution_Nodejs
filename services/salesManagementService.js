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
            COALESCE(weight.count, 0) AS total_count,
            COALESCE(amount.total_amount, 0) AS total_amount
        FROM (
            SELECT
                ${config.weightColumn
            ? `SUM(${config.weightColumn})`
            : `0`
        } AS total_weight,
                ${config.quantityExpr} AS total_quantity,
                COUNT(DISTINCT t.id) AS count
            FROM ${config.table} t
            LEFT JOIN ${config.itemTable} i
                ON i.${config.itemFk} = t.id
                AND i.deleted_at IS NULL
                ${config.itemCondition || ""}
            WHERE ${whereSql}
              AND t.deleted_at IS NULL AND t.is_active = true
        ) weight
        CROSS JOIN (
            SELECT
                SUM(t.total_amount) AS total_amount
            FROM ${config.table} t
            WHERE ${whereSql}
              AND t.deleted_at IS NULL AND t.is_active = true
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
            page,
            pageSize,
            limit
        } = req.query;

        /* ---------------- VALIDATE TYPE ---------------- */
        const gridConfig = REPORT_CONFIG[type];
        if (!gridConfig) {
            return commonService.badRequest(res, "Invalid report type");
        }

        /* ---------------- PAGINATION ---------------- */
        const finalPageSize = pageSize || limit;
        const hasPagination = page && finalPageSize;
        const perPage = hasPagination ? Number(finalPageSize) : null;
        const offset = hasPagination ? (Number(page) - 1) * perPage : null;

        /* ---------------- WHERE SQL ---------------- */
        const replacements = {};
        let baseWhereSql = ` 1=1 AND t.deleted_at IS NULL
             `;

        baseWhereSql += dateFilter(
            { from_date, to_date, date_filter },
            gridConfig.dateColumn,
            replacements
        );

        if (branch_id) {
            baseWhereSql += " AND t.branch_id = :branch_id";
            replacements.branch_id = branch_id;
        }

        /* ---------------- GRID WHERE ---------------- */
        let gridWhereSql = `
            ${baseWhereSql}
            ${gridConfig.statusCondition || ""}
        `;

        /* ---------------- SEARCH ---------------- */
        if (search) {

            gridWhereSql += `
            AND (
                b.branch_name ILIKE :search
                OR c.customer_name ILIKE :search
                OR e.employee_name ILIKE :search
                OR t.${gridConfig.codeColumn} ILIKE :search
            )
        `;

            replacements.search = `%${search}%`;
        }

        /* ---------------- SCORECARDS (ALL TYPES) ---------------- */
        const scorecard = {};

        for (const reportType of Object.keys(REPORT_CONFIG)) {
            const cfg = REPORT_CONFIG[reportType];

            const scorecardWhereSql = `
                1=1
                AND t.deleted_at IS NULL
                AND t.is_active = true
                ${dateFilter(
                { from_date, to_date, date_filter },
                cfg.dateColumn,
                replacements
            )}
                ${branch_id ? " AND t.branch_id = :branch_id" : ""}
                ${cfg.statusCondition || ""}
            `;

            scorecard[reportType] = await getScorecardByType({
                config: cfg,
                whereSql: scorecardWhereSql,
                replacements
            });
        }

        /* ---------------- GRID QUERY ---------------- */
        let gridSql = `
        SELECT
            t.*,
            b.branch_name,
            c.customer_code,
            c.customer_name,
            e.employee_name,
            c.mobile_number,
            ${gridConfig.weightColumn
                        ? `COALESCE(items.total_weight, 0)`
                        : `0`
                    } AS total_weight,
            COALESCE(items.quantity, 0) AS quantity,
            COALESCE(t.total_amount, 0) AS total_amount
            ${gridConfig.extraSelectSql || ""}
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
            WHERE i.deleted_at IS NULL ${gridConfig.itemCondition || ""}
            GROUP BY i.${gridConfig.itemFk}
        ) items ON items.parent_id = t.id
        LEFT JOIN customers c ON c.id = t.customer_id
        LEFT JOIN employees e ON e.id = t.employee_id
        LEFT JOIN branches b ON b.id = t.branch_id
        ${gridConfig.extraJoinSql || ""}
        WHERE ${gridWhereSql}
        ORDER BY t.id DESC
    `;

        if (hasPagination) {
            gridSql += " LIMIT :limit OFFSET :offset";
            replacements.limit = perPage;
            replacements.offset = offset;
        }

        const data = await sequelize.query(gridSql, {
            replacements,
            type: QueryTypes.SELECT
        });

        /* ---------------- COUNT QUERY ---------------- */
        let pagination = null;

        if (hasPagination) {
            const countSql = `
                SELECT COUNT(*)::int AS total
                FROM ${gridConfig.table} t
                LEFT JOIN customers c ON c.id = t.customer_id
                LEFT JOIN employees e ON e.id = t.employee_id
                LEFT JOIN branches b ON b.id = t.branch_id
                WHERE ${gridWhereSql}
            `;

            const [{ total }] = await sequelize.query(countSql, {
                replacements,
                type: QueryTypes.SELECT
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
        const invoiceDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "sib.created_at",
            replacements
        );

        const orderDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "o.created_at",
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
  -- Offline invoice sales
        SELECT
            fp.product_id,
            fp.branch_id,
            fp.subcategory_id,
            SUM(sii.quantity - sii.returned_quantity) AS sold_qty,
            SUM(COALESCE(sii.gross_weight, 0)) AS total_gross_weight
        FROM filtered_products fp
        JOIN sales_invoice_bill_items sii
            ON sii.product_id = fp.product_id
            AND sii.deleted_at IS NULL
            AND sii.is_returned = false
        JOIN sales_invoice_bills sib
            ON sib.id = sii.invoice_bill_id
            AND sib.deleted_at IS NULL
            AND sib.is_active = true
            AND sib.status = 'Invoice'
            ${invoiceDateCondition}
        GROUP BY
            fp.product_id,
            fp.branch_id,
            fp.subcategory_id

        UNION ALL

        -- Online order sales
        SELECT
            fp.product_id,
            oi.branch_id,
            fp.subcategory_id,
            SUM(oi.quantity) AS sold_qty,
            SUM(COALESCE(oi.gross_weight, 0) * COALESCE(oi.quantity, 0)) AS total_gross_weight
        FROM filtered_products fp
        JOIN order_items oi
            ON oi.product_id = fp.product_id
            AND oi.deleted_at IS NULL
            AND oi.item_status <> 'Cancelled'
        JOIN orders o
            ON o.id = oi.order_id
            AND o.deleted_at IS NULL
            AND o.order_status <> 3
            ${orderDateCondition}
        WHERE (:branch_id IS NULL OR oi.branch_id = :branch_id)
        GROUP BY
            fp.product_id,
            oi.branch_id,
            fp.subcategory_id
        )
      SELECT
        sp.branch_id AS branch_id,
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
      LEFT JOIN branches b ON b.id = sp.branch_id
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
        sp.branch_id,
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
            page = 1,
            limit = 10,
        } = req.query;

        if (!branch_id || !subcategory_id) {
            return commonService.badRequest(
                res,
                "branch_id and subcategory_id are required"
            );
        }

        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const parsedLimit = Math.max(parseInt(limit, 10) || 10, 1);
        const offset = (parsedPage - 1) * parsedLimit;

        const replacements = {
            branch_id,
            subcategory_id,
            vendor_id: vendor_id || null,
            purity: purity || null,
            category_id: category_id || null,
            material_type_id: material_type_id || null,
            search: search ? `%${search}%` : null,
            limit: parsedLimit,
            offset,
        };

        const invoiceDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "sib.created_at",
            replacements
        );

        const orderDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "o.created_at",
            replacements
        );

        const rows = await sequelize.query(
            `
WITH sold_rows AS (
    SELECT
        sii.product_id,
        sii.product_item_detail_id,
        SUM(COALESCE(sii.quantity,0) - COALESCE(sii.returned_quantity,0)) AS quantity,
        SUM(COALESCE(sii.gross_weight,0)) AS gross_weight,
        SUM(COALESCE(sii.net_weight,0)) AS net_weight
    FROM sales_invoice_bill_items sii
    JOIN sales_invoice_bills sib
        ON sib.id = sii.invoice_bill_id
        AND sib.deleted_at IS NULL
        AND sib.is_active = true
        AND sib.status = 'Invoice'
        ${invoiceDateCondition}
    JOIN products p
        ON p.id = sii.product_id
        AND p.deleted_at IS NULL
        AND p.branch_id = :branch_id
        AND p.subcategory_id = :subcategory_id
        AND (:vendor_id IS NULL OR p.vendor_id = :vendor_id)
        AND (:purity IS NULL OR p.purity = :purity)
        AND (:category_id IS NULL OR p.category_id = :category_id)
        AND (:material_type_id IS NULL OR p.material_type_id = :material_type_id)
    WHERE sii.deleted_at IS NULL
        AND sii.is_returned = false
    GROUP BY sii.product_id, sii.product_item_detail_id

    UNION ALL

    SELECT
        oi.product_id,
        oi.product_item_id AS product_item_detail_id,
        SUM(COALESCE(oi.quantity,0)) AS quantity,
        SUM(COALESCE(oi.gross_weight,0)) AS gross_weight,
        SUM(COALESCE(oi.net_weight,0)) AS net_weight
    FROM order_items oi
    JOIN orders o
        ON o.id = oi.order_id
        AND o.deleted_at IS NULL
        AND o.order_status <> 3
        ${orderDateCondition}
    JOIN products p
        ON p.id = oi.product_id
        AND p.deleted_at IS NULL
        AND oi.branch_id = :branch_id
        AND p.subcategory_id = :subcategory_id
        AND (:vendor_id IS NULL OR p.vendor_id = :vendor_id)
        AND (:purity IS NULL OR p.purity = :purity)
        AND (:category_id IS NULL OR p.category_id = :category_id)
        AND (:material_type_id IS NULL OR p.material_type_id = :material_type_id)
    WHERE oi.deleted_at IS NULL
        AND oi.item_status <> 'Cancelled'
    GROUP BY oi.product_id, oi.product_item_id
),

item_sales AS (
    SELECT
        product_id,
        product_item_detail_id,
        SUM(quantity) AS quantity,
        SUM(gross_weight) AS gross_weight,
        SUM(net_weight) AS net_weight
    FROM sold_rows
    GROUP BY product_id, product_item_detail_id
),

product_sales AS (
    SELECT
        product_id,
        COUNT(DISTINCT product_item_detail_id) AS variation_count,
        SUM(quantity) AS total_quantity,
        SUM(gross_weight) AS total_gross_weight,
        SUM(net_weight) AS total_net_weight
    FROM item_sales
    GROUP BY product_id
),

filtered_products AS (
    SELECT
        ps.product_id,
        ps.variation_count,
        ps.total_quantity,
        ps.total_gross_weight,
        ps.total_net_weight,
        p.sku_id AS product_sku_id,
        p.product_name,
        p.purity,
        p.hsn_code,
        p.image_urls AS product_images,
        p.variation_type,
        v.id AS vendor_id,
        v.vendor_name,
        v.vendor_code,
        v.vendor_image_url,
        mt.id AS material_type_id,
        mt.material_type,
        c.id AS category_id,
        c.category_name,
        sc.id AS subcategory_id,
        sc.subcategory_name
    FROM product_sales ps
    JOIN products p
        ON p.id = ps.product_id
    LEFT JOIN vendors v
        ON v.id = p.vendor_id
    LEFT JOIN "materialTypes" mt
        ON mt.id = p.material_type_id
    LEFT JOIN categories c
        ON c.id = p.category_id
    LEFT JOIN subcategories sc
        ON sc.id = p.subcategory_id
    WHERE (
        :search IS NULL
        OR p.product_name ILIKE :search
        OR p.sku_id ILIKE :search
        OR v.vendor_name ILIKE :search
    )
),

paginated_products AS (
    SELECT *
    FROM filtered_products
    ORDER BY
        total_quantity DESC,
        total_gross_weight DESC,
        product_id
    LIMIT :limit
    OFFSET :offset
)

SELECT
    pp.*,
    pid.id AS product_item_detail_id,
    TRIM(pid.sku_id) AS sku_id,
    TRIM(pid.variation) AS variation,
    items.quantity AS item_quantity,
    items.gross_weight AS item_gross_weight,
    items.net_weight AS item_net_weight
FROM paginated_products pp
JOIN item_sales items
    ON items.product_id = pp.product_id
LEFT JOIN "productItemDetails" pid
    ON pid.id = items.product_item_detail_id
    AND pid.deleted_at IS NULL
ORDER BY
    pp.total_quantity DESC,
    pp.total_gross_weight DESC,
    pp.product_id,
    pid.id;
`,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        const groupedMap = new Map();

        for (const row of rows) {
            if (!groupedMap.has(row.product_id)) {
                groupedMap.set(row.product_id, {
                    vendor_image: row.vendor_image_url,
                    vendor_code: row.vendor_code,
                    vendor_name: row.vendor_name,
                    vendor_id: row.vendor_id,
                    product_sku_id: row.product_sku_id,
                    branch_id,
                    hsn_code: row.hsn_code,
                    product_name: row.product_name,
                    variation_type: row.variation_type,
                    product_images: row.product_images,
                    purity: row.purity,
                    material_type: row.material_type,
                    material_type_id: row.material_type_id,
                    category_name: row.category_name,
                    category_id: row.category_id,
                    subcategory_name: row.subcategory_name,
                    subcategory_id: row.subcategory_id,
                    product_id: row.product_id,
                    variation_count: Number(row.variation_count),
                    total_quantity: Number(row.total_quantity),
                    total_gross_weight: Number(row.total_gross_weight).toFixed(3),
                    total_net_weight: Number(row.total_net_weight).toFixed(3),
                    itemDetails: [],
                });
            }

            groupedMap.get(row.product_id).itemDetails.push({
                id: row.product_item_detail_id,
                product_id: row.product_id,
                sku_id: row.sku_id,
                variation: row.variation || "{}",
                quantity: Number(row.item_quantity),
                gross_weight: Number(row.item_gross_weight).toFixed(3),
                net_weight: Number(row.item_net_weight).toFixed(3),
            });
        }

        const data = Array.from(groupedMap.values());

        return commonService.okResponse(res, {
            data,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
            },
        });
    } catch (error) {
        console.error("Fast Moving Sold Products Error", error);
        return commonService.handleError(res, error);
    }
};


const getTopBuyingCustomers = async (req, res) => {
    try {

        const rows = await getTopBuyingCustomersData(req.query);

        return commonService.okResponse(res, {
            data: rows,
        });

    } catch (error) {

        console.error("Top Buying Customer Error", error);

        return commonService.handleError(res, error);
    }
};

const getTopBuyingCustomersData = async ({
    branch_id,
    from_date,
    to_date,
    date_filter,
    limit
}) => {

    const replacements = {};

    const dateCondition = dateFilter(
        { from_date, to_date, date_filter },
        "sib.created_at",
        replacements
    );

    let branchCondition = "";

    if (branch_id) {
        branchCondition = ` AND sib.branch_id = :branch_id `;
        replacements.branch_id = Number(branch_id);
    }

    let limitSql = "";

    if (limit) {
        limitSql = ` LIMIT :limit `;
        replacements.limit = Number(limit);
    }

    const rows = await sequelize.query(
        `
        SELECT
            c.id AS customer_id,
            c.customer_code,
            c.customer_name,
            c.mobile_number,

            COUNT(DISTINCT sib.id) AS no_of_orders,

            ROUND(
                COALESCE(SUM(
                    (
                        SELECT COALESCE(SUM(sibi.amount * (sibi.quantity - COALESCE(sibi.returned_quantity, 0)) / NULLIF(sibi.quantity, 0)), 0)
                        FROM sales_invoice_bill_items sibi
                        WHERE sibi.invoice_bill_id = sib.id
                            AND sibi.deleted_at IS NULL
                    )
                ), 0),
                2
            ) AS purchase_amount

        FROM sales_invoice_bills sib

        JOIN customers c
            ON c.id = sib.customer_id
            AND c.deleted_at IS NULL

        WHERE sib.deleted_at IS NULL
          AND sib.is_active = true
          AND sib.status = 'Invoice'
          ${dateCondition}
          ${branchCondition}

        GROUP BY
            c.id,
            c.customer_code,
            c.customer_name,
            c.mobile_number

        ORDER BY purchase_amount DESC

        ${limitSql}
        `,
        {
            replacements,
            type: QueryTypes.SELECT,
        }
    );

    return rows;
};

// Dashboard APIs
const getBranchWiseSalesCount = async (req, res) => {
    try {
        const {
            branch_id,
            from_date,
            to_date,
            search,
            date_filter
        } = req.query;

        const replacements = {};
        let whereSql = `WHERE t.deleted_at IS NULL AND t.is_active = true`;

        whereSql += dateFilter(
            { from_date, to_date, date_filter },
            "t.created_at",
            replacements
        );

        if (branch_id) {
            whereSql += ` AND t.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        if (search) { 
            whereSql += ` AND b.branch_name ILIKE :search`;
            replacements.search = `%${search}%`;
        }
        
        const salesInvoiceSql = `
      SELECT
        b.id AS branch_id,
        b.branch_no,
        b.branch_name,
        COUNT(DISTINCT t.id)::int AS count,
        COALESCE(SUM(t.total_amount), 0) AS value
      FROM sales_invoice_bills t
      JOIN branches b ON b.id = t.branch_id
      ${whereSql}
        AND t.status = 'Invoice' AND t.is_active = true
      GROUP BY b.id, b.branch_name, b.branch_no
    `;

        const salesReturnSql = `
      SELECT
        b.id AS branch_id,
        b.branch_no,
        COUNT(DISTINCT t.id)::int AS count,
        COALESCE(SUM(t.total_amount), 0) AS value
      FROM sales_returns t
      JOIN branches b ON b.id = t.branch_id
      ${whereSql}
        AND t.status = 'Printed' AND t.is_active = true
      GROUP BY b.id, b.branch_no
    `;

        const estimateSql = `
      SELECT
        b.id AS branch_id,
        b.branch_no,
        COUNT(DISTINCT t.id)::int AS count,
        COALESCE(SUM(t.total_amount), 0) AS value
      FROM estimate_bills t
      JOIN branches b ON b.id = t.branch_id
      ${whereSql}
        AND t.status = 'Printed' AND t.is_active = true
      GROUP BY b.id, b.branch_no
    `;

        const oldJewelSql = `
      SELECT
        b.id AS branch_id,
        b.branch_no,
        COUNT(DISTINCT t.id)::int AS count,
        COALESCE(SUM(t.total_amount), 0) AS value
      FROM old_jewels t
      JOIN branches b ON b.id = t.branch_id
      ${whereSql}
        AND t.is_active = true
      GROUP BY b.id,b.branch_no
    `;

        const jewelRepairSql = `
      SELECT
        b.id AS branch_id,
        b.branch_no,
        COUNT(DISTINCT t.id)::int AS count,
        COALESCE(SUM(t.total_amount), 0) AS value
      FROM jewel_repairs t
      JOIN branches b ON b.id = t.branch_id
      ${whereSql}
        AND t.is_active = true
      GROUP BY b.id, b.branch_no
    `;

        const [
            salesInvoice,
            salesReturn,
            estimate,
            oldJewel,
            jewelRepair
        ] = await Promise.all([
            sequelize.query(salesInvoiceSql, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(salesReturnSql, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(estimateSql, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(oldJewelSql, { replacements, type: sequelize.QueryTypes.SELECT }),
            sequelize.query(jewelRepairSql, { replacements, type: sequelize.QueryTypes.SELECT }),
        ]);

        const branchMap = {};

        const initBranch = (row) => {
            if (!branchMap[row.branch_id]) {
                branchMap[row.branch_id] = {
                    branch_id: row.branch_id,
                    branch_name: row.branch_name,
                    branch_no: row.branch_no,
                    estimate: { count: 0, value: 0 },
                    sales_invoice: { count: 0, value: 0 },
                    sales_return: { count: 0, value: 0 },
                    old_jewel: { count: 0, value: 0 },
                    jewel_repair: { count: 0, value: 0 }
                };
            }
            return branchMap[row.branch_id];
        };

        salesInvoice.forEach(r => {
            const b = initBranch(r);
            b.sales_invoice = { count: r.count, value: Number(r.value) };
        });

        salesReturn.forEach(r => {
            const b = branchMap[r.branch_id];
            if (b) b.sales_return = { count: r.count, value: Number(r.value) };
        });

        estimate.forEach(r => {
            const b = branchMap[r.branch_id];
            if (b) b.estimate = { count: r.count, value: Number(r.value) };
        });

        oldJewel.forEach(r => {
            const b = branchMap[r.branch_id];
            if (b) b.old_jewel = { count: r.count, value: Number(r.value) };
        });

        jewelRepair.forEach(r => {
            const b = branchMap[r.branch_id];
            if (b) b.jewel_repair = { count: r.count, value: Number(r.value) };
        });

        return commonService.okResponse(res, {
            rows: Object.values(branchMap)
        });

    } catch (error) {
        console.error("Branch Wise Sales Count Error:", error);
        return commonService.handleError(res, error);
    }
};

const getBranchwiseSalesAndCustomerStats = async (req, res) => {
    try {
        /* ---------- BRANCH WISE SALES ---------- */
        const branchWiseSalesSql = `
      SELECT
        b.id AS branch_id,
        b.branch_name,
        COUNT(DISTINCT t.id) AS invoice_count,
        COALESCE(SUM(t.total_amount), 0) AS total_amount,
        COALESCE(SUM(sibi.quantity), 0) AS total_quantity,
        COALESCE(
            SUM(
                COALESCE(sibi.quantity, 0) *
                COALESCE(sibi.gross_weight, 0)
            ),
            0
        ) AS total_weight
      FROM sales_invoice_bills t
      JOIN branches b ON b.id = t.branch_id
      LEFT JOIN sales_invoice_bill_items sibi ON sibi.invoice_bill_id = t.id AND sibi.deleted_at IS NULL
      WHERE t.status = 'Invoice'
        AND t.is_active = true
        AND t.deleted_at IS NULL
      GROUP BY b.id, b.branch_name
      ORDER BY b.id
    `;

        const branchWiseSales = await sequelize.query(branchWiseSalesSql, {
            type: sequelize.QueryTypes.SELECT
        });

        /* ---------- CUSTOMER STATS ---------- */
        const customerStatsSql = `
      SELECT
        (
          SELECT COUNT(DISTINCT customer_id)
          FROM sales_invoice_bills
          WHERE status = 'Invoice'
            AND is_active = true
            AND deleted_at IS NULL
        ) AS buying_customers,

        (
          SELECT COUNT(DISTINCT customer_id)
          FROM sales_returns
          WHERE status = 'Printed' AND is_active = true
            AND deleted_at IS NULL
        ) AS returning_customers,

        (
          SELECT
            ROUND(
              COUNT(DISTINCT customer_id)::numeric /
              NULLIF(COUNT(DISTINCT invoice_date), 0),
              0
            )
          FROM sales_invoice_bills
          WHERE status = 'Invoice'
            AND is_active = true
            AND deleted_at IS NULL
        ) AS avg_customer_per_day
    `;

        const [customerStats] = await sequelize.query(customerStatsSql, {
            type: sequelize.QueryTypes.SELECT
        });

        return commonService.okResponse(res, {
            branchWiseSales,
            customerStats
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        return commonService.handleError(res, error);
    }
};

const getSalesByMaterialType = async (req, res) => {
    try {
        const { branch_id, from_date, to_date, date_filter } = req.query;

        const replacements = {};
        let whereSql = `
            t.status = 'Invoice'
            AND t.is_active = true
            AND t.deleted_at IS NULL
            `;

        /* ---------- DATE FILTER ---------- */
        if (from_date && to_date) {
            whereSql += ` AND t.invoice_date BETWEEN :from_date AND :to_date`;
            replacements.from_date = from_date;
            replacements.to_date = to_date;
        }

        /* ---------- BRANCH FILTER ---------- */
        if (branch_id) {
            whereSql += ` AND t.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        const sql = `
        WITH material_sales AS (
            SELECT
                mt.id AS material_type_id,
                mt.material_type,
                SUM(i.amount * (i.quantity - i.returned_quantity) / NULLIF(i.quantity, 0)) AS material_amount
            FROM sales_invoice_bills t
            JOIN sales_invoice_bill_items i
                ON i.invoice_bill_id = t.id AND i.is_returned = false
                AND i.deleted_at IS NULL
            JOIN products p
                ON p.id = i.product_id
                AND p.deleted_at IS NULL
            JOIN "materialTypes" mt
                ON mt.id = p.material_type_id
                AND mt.deleted_at IS NULL
            WHERE ${whereSql}
            GROUP BY mt.id, mt.material_type
        ),
        total AS (
            SELECT SUM(material_amount) AS total_amount
            FROM material_sales
        )
        SELECT
            m.material_type_id,
            m.material_type,
            m.material_amount AS amount,
            ROUND(
                (m.material_amount / NULLIF(t.total_amount, 0)) * 100,
                2
            ) AS percentage,
            t.total_amount
        FROM material_sales m
        CROSS JOIN total t
        ORDER BY m.material_amount DESC
        `;

        const rows = await sequelize.query(sql, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        const totalAmount = rows.length ? rows[0].total_amount : 0;

        return commonService.okResponse(res, {
            total_amount: totalAmount,
            materials: rows.map(r => ({
                material_type_id: r.material_type_id,
                material_type: r.material_type,
                amount: Number(r.amount),
                percentage: Number(r.percentage)
            }))
        });

    } catch (error) {
        console.error("Sales by Material Type Error:", error);
        return commonService.handleError(res, error);
    }
};

const getFastMovingCategoryStats = async (req, res) => {
    try {
        const {
            branch_id,
            search,
            from_date,
            to_date,
            date_filter,
            page,
            limit
        } = req.query;

        const hasPagination = page && limit;
        const pageNum = hasPagination ? Number(page) : null;
        const limitNum = hasPagination ? Number(limit) : null;
        const offset = hasPagination ? (pageNum - 1) * limitNum : null;

        const replacements = {
            branch_id: branch_id || null,
            search: search ? `%${search}%` : null
        };

        const invoiceDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "sib.invoice_date",
            replacements
        );

        const orderDateCondition = dateFilter(
            { from_date, to_date, date_filter },
            "o.order_date",
            replacements
        );

        /* ---------------- MAIN QUERY ---------------- */

        let query = `
        SELECT
            x.subcategory_id,
            x.subcategory_name,
            ROUND(SUM(x.sold_value), 2) AS sold_value,
            SUM(x.sold_quantity) AS sold_quantity
        FROM (
            -- Offline sales invoice
            SELECT
                sc.id AS subcategory_id,
                sc.subcategory_name,
                COALESCE(sii.amount * (sii.quantity - COALESCE(sii.returned_quantity, 0)) / NULLIF(sii.quantity, 0), 0) AS sold_value,
                COALESCE(sii.quantity - COALESCE(sii.returned_quantity, 0), 0) AS sold_quantity
            FROM sales_invoice_bill_items sii
            JOIN sales_invoice_bills sib
                ON sib.id = sii.invoice_bill_id
                AND sib.deleted_at IS NULL
                AND sib.is_active = true
                AND sib.status = 'Invoice'
                ${invoiceDateCondition}
            JOIN products p
                ON p.id = sii.product_id
                AND p.deleted_at IS NULL
                AND (:branch_id IS NULL OR p.branch_id = :branch_id)
            JOIN subcategories sc
                ON sc.id = p.subcategory_id
                AND sc.deleted_at IS NULL
            WHERE sii.deleted_at IS NULL

            UNION ALL

            -- Online orders
            SELECT
                sc.id AS subcategory_id,
                sc.subcategory_name,
                COALESCE(oi.amount, 0) AS sold_value,
                COALESCE(oi.quantity, 0) AS sold_quantity
            FROM order_items oi
            JOIN orders o
                ON o.id = oi.order_id
                AND o.deleted_at IS NULL
                AND o.order_status <> 3
                ${orderDateCondition}
            JOIN products p
                ON p.id = oi.product_id
                AND p.deleted_at IS NULL
            JOIN subcategories sc
                ON sc.id = p.subcategory_id
                AND sc.deleted_at IS NULL
            WHERE oi.deleted_at IS NULL
            AND oi.item_status <> 'Cancelled'
            AND (:branch_id IS NULL OR oi.branch_id = :branch_id)
        ) x
        WHERE 1=1

        ${search ? `AND sc.subcategory_name ILIKE :search` : ""}
        GROUP BY x.subcategory_id, x.subcategory_name
        ORDER BY sold_value DESC
        `;

        if (hasPagination) {
            query += ` LIMIT :limit OFFSET :offset`;
            replacements.limit = limitNum;
            replacements.offset = offset;
        }

        const rows = await sequelize.query(query, {
            replacements,
            type: sequelize.QueryTypes.SELECT
        });

        /* ---------------- COUNT QUERY ---------------- */

        let pagination = null;

        if (hasPagination) {

            const countQuery = `
            SELECT COUNT(DISTINCT x.subcategory_id)::int AS total
            FROM (
                SELECT p.subcategory_id
                FROM sales_invoice_bill_items sii
                JOIN sales_invoice_bills sib
                    ON sib.id = sii.invoice_bill_id
                    AND sib.deleted_at IS NULL
                    AND sib.is_active = true
                    AND sib.status = 'Invoice'
                    ${invoiceDateCondition}
                JOIN products p
                    ON p.id = sii.product_id
                    AND p.deleted_at IS NULL
                    AND (:branch_id IS NULL OR p.branch_id = :branch_id)
                JOIN subcategories sc
                    ON sc.id = p.subcategory_id
                    AND sc.deleted_at IS NULL
                WHERE sii.deleted_at IS NULL
                AND sii.is_returned = false
                ${search ? `AND sc.subcategory_name ILIKE :search` : ""}

                UNION ALL

                SELECT p.subcategory_id
                FROM order_items oi
                JOIN orders o
                    ON o.id = oi.order_id
                    AND o.deleted_at IS NULL
                    AND o.order_status <> 3
                    ${orderDateCondition}
                JOIN products p
                    ON p.id = oi.product_id
                    AND p.deleted_at IS NULL
                JOIN subcategories sc
                    ON sc.id = p.subcategory_id
                    AND sc.deleted_at IS NULL
                WHERE oi.deleted_at IS NULL
                AND oi.item_status <> 'Cancelled'
                AND (:branch_id IS NULL OR oi.branch_id = :branch_id)
                ${search ? `AND sc.subcategory_name ILIKE :search` : ""}
            ) x
            `;

            const [{ total }] = await sequelize.query(countQuery, {
                replacements,
                type: sequelize.QueryTypes.SELECT
            });

            pagination = {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            };
        }

        return commonService.okResponse(res, {
            data: rows,
            pagination
        });

    } catch (error) {
        console.error("Fast Moving Category Stats Error", error);
        return commonService.handleError(res, error);
    }
};

const getEstimateConversionRate = async (req, res) => {
    try {

        const { branch_id, from_date, to_date } = req.query;

        let whereSql = `
      WHERE eb.deleted_at IS NULL
      AND eb.is_active = true
    `;

        const replacements = {};

        /* ---------- DATE FILTER ---------- */
        if (from_date && to_date) {
            whereSql += ` AND eb.estimate_date BETWEEN :from_date AND :to_date`;
            replacements.from_date = from_date;
            replacements.to_date = to_date;
        }

        /* ---------- BRANCH FILTER ---------- */
        if (branch_id) {
            whereSql += ` AND eb.branch_id = :branch_id`;
            replacements.branch_id = branch_id;
        }

        const [result] = await sequelize.query(
            `
      SELECT
        COUNT(*) AS total_estimates,
        COUNT(*) FILTER (WHERE eb.is_converted = true) AS converted_estimates,
        ROUND(
          (COUNT(*) FILTER (WHERE eb.is_converted = true)::decimal / NULLIF(COUNT(*),0)) * 100,
          2
        ) AS conversion_rate
      FROM estimate_bills eb
      ${whereSql}
      `,
            {
                replacements,
                type: sequelize.QueryTypes.SELECT
            }
        );

        return commonService.okResponse(res, result);

    } catch (error) {
        return commonService.handleError(res, error);
    }
};



module.exports = {
    getSalesReport,
    getFastMovingCategoryStats,
    getFastMovingSubCategories,
    getFastMovingSoldProducts,
    getTopBuyingCustomers,
    getTopBuyingCustomersData,
    getBranchWiseSalesCount,
    getBranchwiseSalesAndCustomerStats,
    getSalesByMaterialType,
    getEstimateConversionRate,
    getScorecardByType
};
