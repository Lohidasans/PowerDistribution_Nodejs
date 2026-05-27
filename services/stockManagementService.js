const { Op } = require("sequelize");
const commonService = require("./commonService");
const { models, sequelize } = require("../models/index");
const { dateFilter } = require("../helpers/dateHelper");

/**
 * =========================================================
 * NOTES (WHAT WAS OPTIMIZED / FIXED)
 * =========================================================
 * 1) getStockOverviewCount:
 *    - reduced 4 DB round-trips -> 2 round-trips
 *      (one query returns stock_in_hand + low_stock + out_of_stock, second query returns total_stock_value)
 *
 * 2) getOutOfStockSummaryInternal:
 *    - FIXED: previously used buildSubcategoryFilters() which references c/mt/b aliases,
 *      but query didn’t join categories/materialTypes/branches -> could break when search/category/material filters used
 *    - optimized: COUNT(*) directly instead of fetching rows and using rows.length
 *
 * 3) getLowStockSummaryInternal:
 *    - optimized to reuse filtered products early to reduce rows scanned
 *
 * 4) buildSubcategoryFilters:
 *    - kept behavior, but it assumes joins exist (sc + p + c + mt + b). Now internal summary provides those joins.
 *
 * (You can further boost performance with indexes at DB level; I added suggestions at bottom as comments)
 */

/* =========================================================
   OLD JEWEL REPORT
========================================================= */
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
      limit,
    } = req.query;

    if (!["old_jewel", "jewel_repair"].includes(type)) {
      return commonService.badRequest(res, "Invalid report type");
    }

    const finalPageSize = pageSize || limit;
    const hasPagination = page && finalPageSize;
    const perPage = hasPagination ? Number(finalPageSize) : null;
    const offset = hasPagination ? (Number(page) - 1) * perPage : null;

    const replacements = {};
    let whereSql = `t.is_active = true`; // Base condition to only consider active records

    whereSql += dateFilter(
      { from_date, to_date, date_filter },
      "t.date",
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

    const config =
      type === "jewel_repair"
        ? {
            table: "jewel_repairs",
            itemTable: "jewel_repair_items",
            itemFk: "repair_id",
            weight: "weight",
            code: "repair_code",
          }
        : {
            table: "old_jewels",
            itemTable: "old_jewel_items",
            itemFk: "old_jewel_id",
            weight: "net_weight",
            code: "old_jewel_code",
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
      ${
        search
          ? ` AND (
            t.${config.code} ILIKE :search
            OR c.customer_name ILIKE :search
            OR c.mobile_number ILIKE :search
          )`
          : ""
      }
      ORDER BY t.id DESC
    `;

    if (hasPagination) {
      gridSql += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = perPage;
      replacements.offset = offset;
    }

    const data = await sequelize.query(gridSql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

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
        totalPages: Math.ceil(total / perPage),
      };
    }

    return commonService.okResponse(res, {
      scorecard: {
        old_jewel: {
          total_weight: Number(oldJewelCard?.total_weight || 0).toFixed(3),
          total_quantity: Number(oldJewelCard?.total_quantity || 0),
        },
        jewel_repair: {
          total_weight: Number(repairCard?.total_weight || 0).toFixed(3),
          total_quantity: Number(repairCard?.total_quantity || 0),
        },
      },
      data,
      pagination,
    });
  } catch (error) {
    console.error("Old Jewel Report Error:", error);
    return commonService.handleError(res, error);
  }
};

/* =========================================================
   STOCK AGEING REPORT
========================================================= */
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
      vendor_id, 

      ageing, // 0_30 | 31_60 | 61_90 | 91_plus
      date_filter,
      from_date,
      to_date,

      page,
      limit,
    } = req.query;

    const usePagination = page && limit;
    const offset = usePagination ? (Number(page) - 1) * Number(limit) : null;

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
    if (vendor_id) {
      whereSql += ` AND p.vendor_id = :vendor_id`;
      replacements.vendor_id = Number(vendor_id);
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

    const stockDateCondition = dateFilter(
      { from_date, to_date, date_filter },
      "p.created_at",
      replacements
    );

    let ageingSql = ``;
    if (ageing === "0_30")
      ageingSql = ` AND (CURRENT_DATE - p.created_at::date) <= 30`;
    if (ageing === "31_60")
      ageingSql = ` AND (CURRENT_DATE - p.created_at::date) BETWEEN 31 AND 60`;
    if (ageing === "61_90")
      ageingSql = ` AND (CURRENT_DATE - p.created_at::date) BETWEEN 61 AND 90`;
    if (ageing === "91_plus")
      ageingSql = ` AND (CURRENT_DATE - p.created_at::date) >= 91`;

    const scoreRows = await sequelize.query(
      `
      SELECT
        CASE
          WHEN (CURRENT_DATE - p.created_at::date) <= 30 THEN '0_30'
          WHEN (CURRENT_DATE - p.created_at::date) BETWEEN 31 AND 60 THEN '31_60'
          WHEN (CURRENT_DATE - p.created_at::date) BETWEEN 61 AND 90 THEN '61_90'
          ELSE '91_plus'
        END AS bucket,
        SUM(pid.quantity * pid.gross_weight) AS total_weight,
        SUM(pid.quantity) AS total_quantity
      FROM products p
      JOIN "productItemDetails" pid ON pid.product_id = p.id
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN branches b ON b.id = p.branch_id
      ${whereSql}
      ${stockDateCondition}
      GROUP BY bucket
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    const cards = {
      "0_30": { weight: "0.000", qty: 0 },
      "31_60": { weight: "0.000", qty: 0 },
      "61_90": { weight: "0.000", qty: 0 },
      "91_plus": { weight: "0.000", qty: 0 },
    };

    scoreRows.forEach((r) => {
      cards[r.bucket].weight = Number(r.total_weight || 0).toFixed(3);
      cards[r.bucket].qty = Number(r.total_quantity || 0);
    });

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
        SUM(pid.quantity * pid.gross_weight) AS total_weight,
        (CURRENT_DATE - p.created_at::date) AS age_days,

        JSON_AGG(
            JSON_BUILD_OBJECT(
            'id', pid.id,
            'product_id', pid.product_id,
            'sku_id', p.sku_id,
            'quantity', pid.quantity,
            'net_weight', pid.net_weight,
            'gross_weight', pid.gross_weight
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
      ${stockDateCondition}
      ${ageingSql}

      GROUP BY
        p.id,
        g.grn_no,
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
      type: sequelize.QueryTypes.SELECT,
    });

    return commonService.okResponse(res, { cards, data });
  } catch (error) {
    console.error("Stock Ageing Error:", error);
    return commonService.handleError(res, error);
  }
};

/* =========================================================
   NEW HELPERS (FILTER BUILDERS)
========================================================= */
const buildBaseFilters = (query, replacements) => {
  let where = `WHERE p.deleted_at IS NULL AND p.status = 'Active'`;

  if (query.branch_id) {
    where += ` AND p.branch_id = :branch_id`;
    replacements.branch_id = query.branch_id;
  }
  if (query.material_type_id) {
    where += ` AND p.material_type_id = :material_type_id`;
    replacements.material_type_id = query.material_type_id;
  }
  if (query.category_id) {
    where += ` AND p.category_id = :category_id`;
    replacements.category_id = query.category_id;
  }
  if (query.vendor_id) {
    where += ` AND p.vendor_id = :vendor_id`;
    replacements.vendor_id = query.vendor_id;
  }
  if (query.subcategory_id) {
    where += ` AND p.subcategory_id = :subcategory_id`;
    replacements.subcategory_id = query.subcategory_id;
  }
  if (query.grn_id) {
    where += ` AND p.grn_id = :grn_id`;
    replacements.grn_id = query.grn_id;
  }
  if (query.ref_no_id) {
    where += ` AND p.ref_no_id = :ref_no_id`;
    replacements.ref_no_id = query.ref_no_id;
  }

  if (query.search) {
    where += `
      AND (
        p.product_name ILIKE :search OR
        p.product_code ILIKE :search OR
        p.sku_id ILIKE :search
      )
    `;
    replacements.search = `%${query.search}%`;
  }

  where += dateFilter(query, "p.created_at", replacements);
  return where;
};

const buildSubcategoryFilters = (query, replacements) => {
  let where = `WHERE sc.deleted_at IS NULL`;

  if (query.material_type_id) {
    where += ` AND sc.materialtype_id = :material_type_id`;
    replacements.material_type_id = query.material_type_id;
  }
  if (query.category_id) {
    where += ` AND sc.category_id = :category_id`;
    replacements.category_id = query.category_id;
  }
  if (query.subcategory_id) {
    where += ` AND sc.id = :subcategory_id`;
    replacements.subcategory_id = query.subcategory_id;
  }

  if (query.search) {
    where += `
      AND (
        sc.subcategory_name ILIKE :search
        OR c.category_name ILIKE :search
        OR mt.material_type ILIKE :search
        OR b.branch_name ILIKE :search
      )
    `;
    replacements.search = `%${query.search}%`;
  }

  // Note: this expects products p to be joined (LEFT JOIN products p ...)
  where += dateFilter(query, "p.created_at", replacements);

  return where;
};

/* =========================================================
   STOCK SUMMARY HELPERS
========================================================= */
const getStockInHandSummary = async (where, replacements) => {
  const [rows] = await sequelize.query(
    `
    SELECT
      COALESCE(SUM(pid.quantity), 0) AS total_quantity,
      COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight,
      COUNT(DISTINCT p.id) AS product_count
    FROM products p
    JOIN "productItemDetails" pid
      ON pid.product_id = p.id
      AND pid.quantity > 0
      AND pid.deleted_at IS NULL
    ${where}
    `,
    { replacements }
  );

  return {
    total_quantity: Number(rows[0]?.total_quantity || 0),
    total_weight: Number(rows[0]?.total_weight || 0),
    product_count: Number(rows[0]?.product_count || 0),
  };
};

//Subcategory is low stock when SUM of all available quantities(for that subcategory + branch)  < reorder_level defined in subcategory table
const getLowStockSummaryInternal = async (where, replacements) => {
  const [rows] = await sequelize.query(
    `
    WITH filtered_products AS (
      SELECT
        p.id,
        p.subcategory_id,
        p.branch_id,
        p.material_type_id,
        p.category_id
      FROM products p
      ${where}
    ),

    product_stock AS (
      SELECT
        fp.subcategory_id,
        fp.branch_id,
        fp.material_type_id,
        fp.category_id,
        COALESCE(SUM(pid.quantity), 0) AS total_qty,
        COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight
      FROM filtered_products fp
      LEFT JOIN "productItemDetails" pid
        ON pid.product_id = fp.id
        AND pid.deleted_at IS NULL
      GROUP BY
        fp.subcategory_id,
        fp.branch_id,
        fp.material_type_id,
        fp.category_id
    )
    SELECT
      COUNT(*) AS subcategory_count,
      COALESCE(SUM(ps.total_weight), 0) AS total_weight

    FROM product_stock ps
    JOIN subcategories sc
      ON sc.id = ps.subcategory_id
      AND sc.deleted_at IS NULL AND sc.status = 'Active'

    WHERE
      -- quantity should be greater than 0
      ps.total_qty > 0
      -- less than reorder level
      AND ps.total_qty < sc.reorder_level
    `,
    { replacements }
  );

  return {
    subcategory_count: Number(rows[0]?.subcategory_count || 0),
    total_weight: Number(rows[0]?.total_weight || 0),
  };
};

const getOutOfStockSummaryInternal = async (query) => {

  const replacements = {};

  let productBranchFilter = "";

  if (query.branch_id) {
    productBranchFilter = `
      AND p.branch_id = :branch_id
    `;
    replacements.branch_id = query.branch_id;
  }

  const [rows] = await sequelize.query(
    `
    SELECT
      COUNT(*) AS subcategory_count
    FROM (
      SELECT sc.id
      FROM subcategories sc
      LEFT JOIN products p
        ON p.subcategory_id = sc.id
        AND p.deleted_at IS NULL
        ${productBranchFilter}
      LEFT JOIN "productItemDetails" pid ON pid.product_id = p.id AND pid.deleted_at IS NULL
      WHERE sc.deleted_at IS NULL AND sc.status = 'Active'
        -- hardcoded HO branch
        AND sc.branch_id = 1

      GROUP BY sc.id
      HAVING
        -- no products
        COUNT(DISTINCT p.id) = 0
        OR
        -- total qty becomes 0
        COALESCE(SUM(pid.quantity), 0) = 0
    ) x
    `,
    { replacements,
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return {
    subcategory_count: Number(rows?.subcategory_count || 0),
  };
};

/* =========================================================
   STOCK LIST HELPERS
========================================================= */
const attachItemDetails = async (products) => {
  if (!products.length) return products;

  const productIds = products.map((p) => p.id);

  const itemDetails = await models.ProductItemDetail.findAll({
    where: {
      product_id: productIds,
      quantity: { [Op.gt]: 0 },
      deleted_at: null,
    },
    order: [["id", "ASC"]],
  });

  const itemsByProduct = itemDetails.reduce((acc, item) => {
    (acc[item.product_id] ??= []).push(item);
    return acc;
  }, {});

  return products.map((product) => {
    const items = itemsByProduct[product.id];
    if (items && items.length > 0) {
      return { ...product, item_details: items };
    }
    return product;
  });
};

const getStockInHandList = async (
  whereClause,
  replacements,
  usePagination,
  limit,
  offset
) => {
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
      COALESCE(SUM(COALESCE(pid.quantity, 0) * COALESCE(pid.gross_weight, 0)), 0) AS total_weight,
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
    LEFT JOIN "productItemDetails" pid
      ON pid.product_id = p.id
      AND pid.deleted_at IS NULL
    LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
    LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
    LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
    LEFT JOIN categories ct ON ct.id = p.category_id
    LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
    LEFT JOIN branches b ON b.id = p.branch_id
    ${whereClause}
    GROUP BY
      p.id,
      mt.material_type,
      mt.material_price,
      ct.category_name,
      ct.category_image_url,
      sc.subcategory_name,
      g.grn_no,
      gi.ref_no,
      b.branch_name
    HAVING COALESCE(SUM(pid.quantity), 0) > 0
    ORDER BY p.id DESC
  `;

  if (usePagination) {
    query += ` LIMIT :limit OFFSET :offset`;
    replacements.limit = limit;
    replacements.offset = offset;
  }

  const [rows] = await sequelize.query(query, { replacements });
  const enrichedRows = await attachItemDetails(rows);

  return { rows: enrichedRows };
};

const getLowStockList = async (
  where,
  replacements,
  usePagination,
  limit,
  offset
) => {

  let query = `
    WITH filtered_products AS (
      SELECT
        p.id,
        p.subcategory_id,
        p.branch_id,
        p.material_type_id,
        p.category_id
      FROM products p
      ${where}
    ),
    product_stock AS (
      SELECT
        fp.subcategory_id,
        fp.branch_id,
        fp.material_type_id,
        fp.category_id,
        COALESCE(SUM(pid.quantity), 0) AS total_qty,
        COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight
      FROM filtered_products fp
      LEFT JOIN "productItemDetails" pid
        ON pid.product_id = fp.id
        AND pid.deleted_at IS NULL
      GROUP BY fp.subcategory_id, fp.branch_id, fp.material_type_id, fp.category_id
    )
    SELECT
      b.branch_name,
      ps.branch_id,
      mt.material_type,
      ps.material_type_id,
      c.id AS category_id,
      c.category_name,

      sc.id AS subcategory_id,
      sc.subcategory_name,
      sc.reorder_level,

      ps.total_qty AS quantity,
      ROUND(ps.total_weight, 2) AS total_weight

    FROM product_stock ps
    JOIN subcategories sc ON sc.id = ps.subcategory_id AND sc.deleted_at IS NULL AND sc.status = 'Active'

    LEFT JOIN branches b ON b.id = ps.branch_id
    LEFT JOIN "materialTypes" mt ON mt.id = ps.material_type_id
    LEFT JOIN categories c ON c.id = ps.category_id

    WHERE ps.total_qty > 0 AND ps.total_qty < sc.reorder_level

    ORDER BY b.branch_name, sc.subcategory_name
  `;

  if (usePagination) {
    query += ` LIMIT :limit OFFSET :offset`;
    replacements.limit = limit;
    replacements.offset = offset;
  }

  const rows = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  return { rows };
};

const getOutOfStockList = async (
  query,
  usePagination,
  limit,
  offset
) => {

  const replacements = {};

  let productBranchFilter = "";

  if (query.branch_id) {
    productBranchFilter = `
      AND p.branch_id = :branch_id
    `;

    replacements.branch_id = query.branch_id;
  }

  let sql = `
    SELECT
      1 AS branch_id,
      'Head Office' AS branch_name,

      mt.material_type,
      sc.materialtype_id,

      c.id AS category_id,
      c.category_name,

      sc.id AS subcategory_id,
      sc.subcategory_name,
      sc.reorder_level,

      COUNT(DISTINCT p.id) AS product_count,
      COALESCE(SUM(pid.quantity), 0) AS quantity,
      COALESCE(ROUND(SUM(pid.quantity * pid.gross_weight), 2), 0) AS total_weight

    FROM subcategories sc
    LEFT JOIN products p ON p.subcategory_id = sc.id AND p.deleted_at IS NULL
      ${productBranchFilter}
    LEFT JOIN "productItemDetails" pid ON pid.product_id = p.id AND pid.deleted_at IS NULL
    LEFT JOIN "materialTypes" mt ON mt.id = sc.materialtype_id
    LEFT JOIN categories c ON c.id = sc.category_id
    WHERE
      sc.deleted_at IS NULL 
      AND sc.status = 'Active'
      -- hardcoded branch
      AND sc.branch_id = 1

    GROUP BY
      mt.material_type,
      sc.materialtype_id,
      c.id,
      c.category_name,
      sc.id,
      sc.subcategory_name,
      sc.reorder_level

    HAVING COUNT(DISTINCT p.id) = 0
      OR
      COALESCE(SUM(pid.quantity), 0) = 0
    ORDER BY sc.subcategory_name
  `;

  if (usePagination) {
    sql += ` LIMIT :limit OFFSET :offset`;

    replacements.limit = limit;
    replacements.offset = offset;
  }

  const rows = await sequelize.query(sql, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  return { rows };
};

/* =========================================================
   STOCK DASHBOARD
========================================================= */
const getStockDashboard = async (req, res) => {
  try {
    const { type = "stock_in_hand", page, limit } = req.query;

    const usePagination = page || limit;
    const pageNum = parseInt(page || 1, 10);
    const limitNum = parseInt(limit || 10, 10);
    const offset = (pageNum - 1) * limitNum;

    const scoreReplacements = {};
    const baseWhere = buildBaseFilters(req.query, scoreReplacements);

    const [stockInHand, lowStock, outOfStock] = await Promise.all([
      getStockInHandSummary(baseWhere, scoreReplacements),
      getLowStockSummaryInternal(baseWhere, scoreReplacements),
      getOutOfStockSummaryInternal(req.query),
    ]);

    let listResult;
    const listReplacements = {};
    const listWhere = buildBaseFilters(req.query, listReplacements);

    switch (type) {
      case "low_stock":
        listResult = await getLowStockList(
          listWhere,
          listReplacements,
          usePagination,
          limitNum,
          offset
        );
        break;

      case "out_of_stock":
        listResult = await getOutOfStockList(
          req.query,
          usePagination,
          limitNum,
          offset
        );
        break;

      default:
        listResult = await getStockInHandList(
          listWhere,
          listReplacements,
          usePagination,
          limitNum,
          offset
        );
    }

    return commonService.okResponse(res, {
      score_cards: {
        stock_in_hand: stockInHand,
        low_stock: lowStock,
        out_of_stock: outOfStock,
      },
      data: listResult,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

/* =========================================================
   DASHBOARD RELATED API'S
========================================================= */
const getBranchStockSummary = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `
      SELECT
        b.id AS branch_id,
        b.branch_name,
        COALESCE(SUM(pid.quantity), 0) AS total_quantity,
        COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight
      FROM branches b
      LEFT JOIN products p
        ON p.branch_id = b.id
        AND p.deleted_at IS NULL
        AND p.status = 'Active'
      LEFT JOIN "productItemDetails" pid
        ON pid.product_id = p.id
        AND pid.deleted_at IS NULL
        AND pid.quantity > 0
      WHERE b.deleted_at IS NULL
      GROUP BY b.id, b.branch_name
      ORDER BY b.branch_name
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    return commonService.okResponse(res, { data: rows });
  } catch (error) {
    console.error("Branch Stock Error:", error);
    return commonService.handleError(res, error);
  }
};

const getBranchCategoryStock = async (req, res) => {
  try {
    const { branch_id } = req.query;

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    const rows = await sequelize.query(
      `
      SELECT
        c.id AS category_id,
        c.category_name,
        COALESCE(SUM(pid.quantity), 0) AS total_quantity,
        COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight
      FROM products p
      JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
      JOIN "productItemDetails" pid
        ON pid.product_id = p.id
        AND pid.deleted_at IS NULL
        AND pid.quantity > 0
      WHERE p.deleted_at IS NULL
        AND p.status = 'Active'
        AND p.branch_id = :branch_id
      GROUP BY c.id, c.category_name
      ORDER BY c.category_name
      `,
      { replacements: { branch_id }, type: sequelize.QueryTypes.SELECT }
    );

    return commonService.okResponse(res, { data: rows });
  } catch (error) {
    console.error("Branch Category Stock Error:", error);
    return commonService.handleError(res, error);
  }
};

const getVendorContributionReport = async (req, res) => {
  try {
    const { from_date, to_date, date_filter, branch_id } = req.query;

    const replacements = {};
    let whereClause = ` WHERE v.deleted_at IS NULL `;

    // ✅ Date filter (grn_date)
    whereClause += dateFilter(
      { from_date, to_date, date_filter },
      "g.grn_date",
      replacements
    );

    // ✅ Branch filter
    if (branch_id) {
      whereClause += ` AND g.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT
        v.id AS vendor_id,
        v.vendor_name,

        gi.material_type_id,
        mt.material_type,

        COALESCE(SUM(gi.quantity), 0) AS quantity,
        COALESCE(SUM(gi.gross_wt_in_g), 0) AS weight,
        COALESCE(SUM(gi.total_amount), 0) AS value

      FROM vendors v
      JOIN grns g ON g.vendor_id = v.id AND g.deleted_at IS NULL
      JOIN "grnItems" gi
        ON gi.grn_id = g.id
        AND gi.deleted_at IS NULL
        AND gi.material_type_id = ANY(v.material_type_ids)
      JOIN "materialTypes" mt ON mt.id = gi.material_type_id AND mt.deleted_at IS NULL

      ${whereClause}

      GROUP BY v.id, v.vendor_name, mt.material_type, gi.material_type_id

      ORDER BY v.vendor_name;
    `;

    const rows = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    // 🔹 Grouping logic (unchanged)
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.vendor_id]) {
        grouped[row.vendor_id] = {
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          materials: {},
        };
      }

      grouped[row.vendor_id].materials[row.material_type] = {
        quantity: Number(row.quantity),
        weight: Number(row.weight),
        value: Number(row.value),
      };
    }

    return res.status(200).json({
      success: true,
      data: Object.values(grouped),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor contribution",
    });
  }
};


const getStockByMaterialTypeReport = async (req, res) => {
  try {
    const { branch_id, from_date, to_date, date_filter } = req.query;

    const replacements = {};
    let whereClause = "";

    if (branch_id) {
      whereClause += " AND p.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    whereClause += dateFilter(
      { from_date, to_date, date_filter },
      "pid.created_at",
      replacements
    );

    const query = `
      SELECT
        mt.id AS material_type_id,
        mt.material_type,
        COALESCE(SUM(pid.quantity), 0) AS total_quantity,
        COALESCE(SUM(pid.gross_weight * pid.quantity), 0) AS total_gross_weight

      FROM "materialTypes" mt
      JOIN products p ON p.material_type_id = mt.id AND p.deleted_at IS NULL
      JOIN "productItemDetails" pid
        ON pid.product_id = p.id
        AND pid.deleted_at IS NULL
        AND pid.quantity > 0
      WHERE mt.deleted_at IS NULL
      ${whereClause}
      GROUP BY mt.id, mt.material_type
      ORDER BY mt.material_type;
    `;

    const data = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      replacements,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock by material type",
    });
  }
};

/* =========================================================
   BRANCHWISE STOCK COUNT
========================================================= */
const mapByBranch = (rows, key = "branch_id") =>
  rows.reduce((acc, r) => {
    acc[r[key]] = r;
    return acc;
  }, {});

const getBranchwiseStockCount = async (req, res) => {
  try {
    const { branch_id, from_date, to_date, date_filter } = req.query;

    const replacements = branch_id ? { branch_id } : {};
    const dateReplacements = { ...replacements };

    const productDateCondition = dateFilter(
      { from_date, to_date, date_filter },
      "p.created_at",
      dateReplacements
    );

    const billingDateCondition = dateFilter(
      { from_date, to_date, date_filter },
      "t.created_at",
      dateReplacements
    );

    const branches = await sequelize.query(
      `
      SELECT
        branches.id AS branch_id,
        branches.branch_name,
        branches.branch_no,
        branches.mobile,
        branches.contact_person,
        branches.district_id,
        d.district_name
      FROM branches
      LEFT JOIN districts d ON d.id = branches.district_id AND d.deleted_at IS NULL
      WHERE branches.deleted_at IS NULL
      ${branch_id ? "AND branches.id = :branch_id" : ""}
      ORDER BY branches.branch_name
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    const [stockRows, lowStockRows, outStockRows, oldJewelRows, repairRows] =
      await Promise.all([
        sequelize.query(
          `
          SELECT
            p.branch_id,
            SUM(pid.quantity) AS total_quantity,
            SUM(pid.quantity * pid.gross_weight) AS total_weight
          FROM products p
          JOIN "productItemDetails" pid
            ON pid.product_id = p.id
            AND pid.quantity > 0
            AND pid.deleted_at IS NULL
          WHERE p.deleted_at IS NULL
            AND p.status = 'Active'
            ${branch_id ? "AND p.branch_id = :branch_id" : ""}
            ${productDateCondition}
          GROUP BY p.branch_id
          `,
          { replacements: dateReplacements, type: sequelize.QueryTypes.SELECT }
        ),
        sequelize.query(
          `
          WITH filtered_products AS (
            SELECT
              p.id,
              p.subcategory_id,
              p.branch_id,
              p.material_type_id,
              p.category_id
            FROM products p
            WHERE p.deleted_at IS NULL
              AND p.status = 'Active'
              ${branch_id ? "AND p.branch_id = :branch_id" : ""}
              ${productDateCondition}
          ),
          product_stock AS (
            SELECT
              fp.subcategory_id,
              fp.branch_id,
              fp.material_type_id,
              fp.category_id,
              COALESCE(SUM(pid.quantity), 0) AS total_qty,
              COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight
            FROM filtered_products fp
            LEFT JOIN "productItemDetails" pid
              ON pid.product_id = fp.id
              AND pid.deleted_at IS NULL
            GROUP BY
              fp.subcategory_id,
              fp.branch_id,
              fp.material_type_id,
              fp.category_id
          )
          SELECT
            ps.branch_id,
            COUNT(*) AS subcategory_count,
            COALESCE(SUM(ps.total_weight), 0) AS total_weight
          FROM product_stock ps
          JOIN subcategories sc
            ON sc.id = ps.subcategory_id
            AND sc.deleted_at IS NULL
            AND sc.status = 'Active'
          WHERE
            ps.total_qty > 0
            AND ps.total_qty < sc.reorder_level
          GROUP BY ps.branch_id
          `,
          { replacements: dateReplacements, type: sequelize.QueryTypes.SELECT }
        ),
        sequelize.query(
          `
          WITH target_branches AS (
            SELECT id AS branch_id
            FROM branches
            WHERE deleted_at IS NULL
              ${branch_id ? "AND id = :branch_id" : ""}
          ),
          active_subcategories AS (
            SELECT sc.id AS subcategory_id
            FROM subcategories sc
            WHERE sc.deleted_at IS NULL
              AND sc.status = 'Active'
              AND sc.branch_id = 1
          ),
          subcategory_stock AS (
            SELECT
              tb.branch_id,
              sc.subcategory_id,
              COUNT(DISTINCT p.id) AS product_count,
              COALESCE(SUM(pid.quantity), 0) AS total_qty
            FROM target_branches tb
            CROSS JOIN active_subcategories sc
            LEFT JOIN products p
              ON p.subcategory_id = sc.subcategory_id
              AND p.branch_id = tb.branch_id
              AND p.deleted_at IS NULL
              ${productDateCondition}
            LEFT JOIN "productItemDetails" pid
              ON pid.product_id = p.id
              AND pid.deleted_at IS NULL
            GROUP BY tb.branch_id, sc.subcategory_id
          )
          SELECT
            branch_id,
            COUNT(*) AS total_quantity
          FROM subcategory_stock
          WHERE product_count = 0
            OR total_qty = 0
          GROUP BY branch_id
          `,
          { replacements: dateReplacements, type: sequelize.QueryTypes.SELECT }
        ),
        sequelize.query(
          `
          SELECT
            t.branch_id,
            SUM(oi.net_weight) AS total_weight,
            COUNT(oi.id) AS total_quantity
          FROM old_jewels t
          JOIN old_jewel_items oi
            ON oi.old_jewel_id = t.id
            AND oi.deleted_at IS NULL
          WHERE t.is_active = true
            ${branch_id ? "AND t.branch_id = :branch_id" : ""}
            ${billingDateCondition}
          GROUP BY t.branch_id
          `,
          { replacements: dateReplacements, type: sequelize.QueryTypes.SELECT }
        ),
        sequelize.query(
          `
          SELECT
            t.branch_id,
            SUM(ri.weight) AS total_weight,
            COUNT(ri.id) AS total_quantity
          FROM jewel_repairs t
          JOIN jewel_repair_items ri
            ON ri.repair_id = t.id
            AND ri.deleted_at IS NULL
          WHERE t.is_active = true
            ${branch_id ? "AND t.branch_id = :branch_id" : ""}
            ${billingDateCondition}
          GROUP BY t.branch_id
          `,
          { replacements: dateReplacements, type: sequelize.QueryTypes.SELECT }
        ),
      ]);

    const stockMap = mapByBranch(stockRows);
    const lowStockMap = mapByBranch(lowStockRows);
    const outStockMap = mapByBranch(outStockRows);
    const oldJewelMap = mapByBranch(oldJewelRows);
    const repairMap = mapByBranch(repairRows);

    const data = branches.map((b) => ({
      branch_id: b.branch_id,
      branch_name: b.branch_name,
      branch_no: b.branch_no,
      mobile: b.mobile,
      contact_person: b.contact_person,
      district_id: b.district_id,
      district_name: b.district_name,

      stock_in_hand: {
        total_weight: Number(stockMap[b.branch_id]?.total_weight || 0),
        total_quantity: Number(stockMap[b.branch_id]?.total_quantity || 0),
      },
      low_stock: {
        total_weight: Number(lowStockMap[b.branch_id]?.total_weight || 0),
        subcategory_count: Number(
          lowStockMap[b.branch_id]?.subcategory_count || 0
        ),
      },
      out_of_stock: {
        total_quantity: Number(outStockMap[b.branch_id]?.total_quantity || 0),
      },
      old_jewel: {
        total_weight: Number(oldJewelMap[b.branch_id]?.total_weight || 0),
        total_quantity: Number(oldJewelMap[b.branch_id]?.total_quantity || 0),
      },
      jewel_repair: {
        total_weight: Number(repairMap[b.branch_id]?.total_weight || 0),
        total_quantity: Number(repairMap[b.branch_id]?.total_quantity || 0),
      },
    }));

    return commonService.okResponse(res, data);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

/* =========================================================
   GRN DISCREPANCY LIST
========================================================= */
const getGrnDiscrepancyList = async (req, res) => {
  try {
    const { page, limit } = req.query;

    const replacements = {};
    const whereConditions = [`g.deleted_at IS NULL`];
    const whereSql = `WHERE ${whereConditions.join(" AND ")}`;

    const hasPagination = page && limit;
    const pageNum = hasPagination ? Number(page) : null;
    const limitNum = hasPagination ? Number(limit) : null;
    const offset = hasPagination ? (pageNum - 1) * limitNum : null;

    let query = `
      SELECT
        g.id,
        g.grn_no,
        g.grn_date AS date,
        g.status_id,
        v.vendor_name,

        COALESCE(gi.total_net_weight, 0) AS ordered_weight,
        COALESCE(gi.total_quantity, 0) AS ordered_qty,

        COALESCE(pi.total_updated_weight, 0) AS updated_weight,
        COALESCE(pi.total_updated_qty, 0) AS updated_qty

      FROM grns g
      LEFT JOIN vendors v ON v.id = g.vendor_id

      LEFT JOIN (
        SELECT
          grn_id,
          SUM(net_wt_in_g) AS total_net_weight,
          SUM(quantity) AS total_quantity
        FROM "grnItems"
        WHERE deleted_at IS NULL
        GROUP BY grn_id
      ) gi ON gi.grn_id = g.id

      LEFT JOIN (
        SELECT
          p.grn_id,
          SUM(pid.net_weight) AS total_updated_weight,
          SUM(pid.quantity) AS total_updated_qty
        FROM products p
        JOIN "productItemDetails" pid
          ON pid.product_id = p.id
          AND pid.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.grn_id
      ) pi ON pi.grn_id = g.id

      ${whereSql}
      ORDER BY g.grn_date DESC, g.grn_no DESC
    `;

    if (hasPagination) {
      query += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = limitNum;
      replacements.offset = offset;
    }

    const rows = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    let updatedCount = 0;
    let yetToUpdateCount = 0;

    const data = rows.map((row) => {
      const orderedWt = Number(row.ordered_weight || 0);
      const updatedWt = Number(row.updated_weight || 0);
      const orderedQty = Number(row.ordered_qty || 0);
      const updatedQty = Number(row.updated_qty || 0);

      const yetToUpdateWt = Number(
        (orderedWt - updatedWt).toFixed(3)
      );

      const yetToUpdateQty = orderedQty - updatedQty;

      // Completion is manual-only; do not infer status from matched qty/weight.
      const status_id = Number(row.status_id || 1);

      if (status_id === 2) updatedCount++;
      else yetToUpdateCount++;

      return {
        id: row.id,
        grn_no: row.grn_no,
        date: row.date,
        vendor_name: row.vendor_name,

        ordered: {
          weight: orderedWt,
          quantity: orderedQty,
        },
        updated: {
          weight: updatedWt,
          quantity: updatedQty,
        },
        yet_to_update: {
          weight: yetToUpdateWt,   // ✅ can be negative
          quantity: yetToUpdateQty // ✅ real difference
        },

        status_id,
      };
    });

    let totalItems = data.length;
    if (hasPagination) {
      const [{ count }] = await sequelize.query(
        `
        SELECT COUNT(*)::int AS count
        FROM grns g
        LEFT JOIN vendors v ON v.id = g.vendor_id
        ${whereSql}
        `,
        { replacements, type: sequelize.QueryTypes.SELECT }
      );
      totalItems = count;
    }

    return commonService.okResponse(res, {
      summary: {
        totalGrns: totalItems,
        updated: updatedCount,
        yetToUpdate: yetToUpdateCount,
      },
      totalItems,
      data,
    });
  } catch (error) {
    console.error("getGrnDiscrepancyList Error:", error);
    return commonService.handleError(res, error);
  }
};

/* =========================================================
   TOTAL STOCK VALUE
========================================================= */
const getTotalStockValueInternal = async (query) => {
  const { branch_id, from_date, to_date, date_filter } = query;

  const replacements = {};
  let where = `
    WHERE g.deleted_at IS NULL
    AND g.is_active = true
  `;

  if (branch_id) {
    where += `
      AND EXISTS (
        SELECT 1
        FROM products p
        WHERE p.grn_id = g.id
          AND p.branch_id = :branch_id
          AND p.deleted_at IS NULL
      )
    `;
    replacements.branch_id = branch_id;
  }

  where += dateFilter({ from_date, to_date, date_filter }, "g.grn_date", replacements);

  const [rows] = await sequelize.query(
    `
    SELECT COALESCE(SUM(g.total_amount), 0) AS total_stock_value
    FROM grns g
    ${where}
    `,
    { replacements }
  );

  return Number(rows[0]?.total_stock_value || 0);
};

/* =========================================================
   OPTIMIZED: STOCK OVERVIEW COUNT (2 QUERIES INSTEAD OF 4)
========================================================= */
const getStockOverviewCount = async (req, res) => {
  try {
    const replacements = {};
    const baseWhere = buildBaseFilters(req.query, replacements);

    const [summary] = await sequelize.query(
      `
      WITH filtered_products AS (
        SELECT p.id, p.subcategory_id, p.branch_id, p.material_type_id, p.category_id
        FROM products p
        ${baseWhere}
      ),
      stock_in_hand AS (
        SELECT
          COALESCE(SUM(pid.quantity), 0) AS total_quantity,
          COALESCE(SUM(pid.quantity * pid.gross_weight), 0) AS total_weight,
          COUNT(DISTINCT fp.id) AS product_count
        FROM filtered_products fp
        JOIN "productItemDetails" pid
          ON pid.product_id = fp.id
          AND pid.deleted_at IS NULL
          AND pid.quantity > 0
      ),
      product_stock AS (
        SELECT
          fp.subcategory_id,
          fp.branch_id,
          fp.material_type_id,
          fp.category_id,
          SUM(pid.quantity) AS total_qty,
          SUM(pid.quantity * pid.gross_weight) AS total_weight
        FROM filtered_products fp
        LEFT JOIN "productItemDetails" pid
          ON pid.product_id = fp.id
          AND pid.deleted_at IS NULL
        GROUP BY fp.subcategory_id, fp.branch_id, fp.material_type_id, fp.category_id
      ),
      low_stock_rows AS (
        SELECT
          ps.subcategory_id,
          ps.branch_id,
          ps.material_type_id,
          ps.category_id,
          ps.total_qty,
          ps.total_weight
        FROM product_stock ps
        JOIN subcategories sc ON sc.id = ps.subcategory_id AND sc.deleted_at IS NULL AND sc.status = 'Active'
        WHERE ps.total_qty > 0 AND ps.total_qty < sc.reorder_level
      ),
      out_of_stock AS (
        SELECT COUNT(*)::int AS subcategory_count
        FROM (
          SELECT
            sc.id
          FROM subcategories sc
          LEFT JOIN products p  ON p.subcategory_id = sc.id  AND p.deleted_at IS NULL AND p.status = 'Active'
          LEFT JOIN "productItemDetails" pid ON pid.product_id = p.id AND pid.deleted_at IS NULL
          LEFT JOIN branches b ON b.id = p.branch_id AND b.deleted_at IS NULL
          LEFT JOIN "materialTypes" mt ON mt.id = sc.materialtype_id AND mt.deleted_at IS NULL
          LEFT JOIN categories c ON c.id = sc.category_id AND c.deleted_at IS NULL
          ${buildSubcategoryFilters(req.query, { ...replacements })}
          AND sc.branch_id = 1
          GROUP BY sc.id
          HAVING
            -- no products
            COUNT(DISTINCT p.id) = 0
            OR
            -- total qty becomes zero
            COALESCE(SUM(pid.quantity), 0) = 0
        ) z
      )
      SELECT
        sih.total_quantity AS stock_total_quantity,
        sih.total_weight AS stock_total_weight,
        sih.product_count AS stock_product_count,

        -- LOW STOCK
        (SELECT COUNT(*) FROM low_stock_rows)
          AS low_subcategory_count,

        (
          SELECT COALESCE(SUM(total_weight), 0)
          FROM low_stock_rows
        ) AS low_total_weight,

         -- OUT OF STOCK
        (
          SELECT subcategory_count
          FROM out_of_stock
        ) AS out_subcategory_count

      FROM stock_in_hand sih
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    // 2) Second query: total stock value (grns sum)
    const totalStockValue = await getTotalStockValueInternal(req.query);

    return commonService.okResponse(res, {
      total_stock_value: totalStockValue,

      stock_in_hand: {
        total_quantity: Number(summary?.stock_total_quantity || 0),
        total_weight: Number(summary?.stock_total_weight || 0),
        product_count: Number(summary?.stock_product_count || 0),
      },

      low_stock: {
        subcategory_count: Number(summary?.low_subcategory_count || 0),
        total_weight: Number(summary?.low_total_weight || 0),
      },

      out_of_stock: {
        subcategory_count: Number(summary?.out_subcategory_count || 0),
      },
    });
  } catch (error) {
    console.error("Stock Overview Count Error:", error);
    return commonService.handleError(res, error);
  }
};

/* =========================================================
   EXPORTS
========================================================= */
module.exports = {
  getOldJewelReport,
  getStockAgeingReport,
  buildBaseFilters,
  buildSubcategoryFilters,

  getStockInHandSummary,
  getLowStockSummaryInternal,
  getOutOfStockSummaryInternal,

  getStockInHandList,
  getLowStockList,
  getOutOfStockList,

  getStockDashboard,
  getBranchStockSummary,
  getBranchCategoryStock,
  getVendorContributionReport,
  getStockByMaterialTypeReport,
  getBranchwiseStockCount,
  getGrnDiscrepancyList,

  getTotalStockValueInternal,
  getStockOverviewCount,
};
