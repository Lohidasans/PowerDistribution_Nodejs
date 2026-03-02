const { models, sequelize } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");
const {
  generateUniqueCode,
  generateProductSKUCode,
} = require("../helpers/codeGeneration");

const GST_PERCENT = 3;

/* =========================================================
   FAST (SYNC) PRICE CALC — NO DB QUERIES
   (Used in LIST endpoints to avoid N+1 queries)
   Response shape stays SAME as your calculateSellingPrice()
========================================================= */
const calculateSellingPriceSync = (
  product,
  item,
  additionalDetails = [],
  materialPrice = 0
) => {
  try {
    let materialRate = Number(materialPrice || 0);

    if (product.product_type === "Piece Rate") {
      const ratePerGram = Number(item.rate_per_gram || 0);
      materialRate = Math.max(ratePerGram, materialRate);
    }

    const netWeight = Number(item.net_weight || 0);
    const materialContribution = materialRate * netWeight;

    const stoneValue = Number(item.stone_value || 0);

    const additionalDetailsSum = (additionalDetails || []).reduce((sum, d) => {
      return sum + (Number(d.value) || 0);
    }, 0);

    let makingCharge = 0;
    const makingChargeValue = Number(item.making_charge || 0);
    switch (item.making_charge_type) {
      case "Per Gram":
        makingCharge = makingChargeValue * netWeight;
        break;
      case "Percentage":
        makingCharge = (makingChargeValue / 100) * materialContribution;
        break;
      case "Amount":
        makingCharge = makingChargeValue;
        break;
      default:
        makingCharge = 0;
    }

    let wastage = 0;
    const wastageValue = Number(item.wastage || 0);
    switch (item.wastage_type) {
      case "Per Gram":
        wastage = wastageValue * netWeight;
        break;
      case "Percentage":
        wastage = (wastageValue / 100) * materialContribution;
        break;
      case "Amount":
        wastage = wastageValue;
        break;
      default:
        wastage = 0;
    }

    const sellingPrice =
      materialContribution +
      makingCharge +
      wastage +
      stoneValue +
      additionalDetailsSum;

    return {
      material_rate_per_gram: materialRate,
      material_contribution: materialContribution,
      making_charge: makingCharge,
      wastage: wastage,
      stone_value: stoneValue,
      additional_details_value: additionalDetailsSum,
      selling_price: sellingPrice,
    };
  } catch (error) {
    console.error("Error in calculateSellingPriceSync:", error);
    return {
      material_rate_per_gram: 0,
      material_contribution: 0,
      making_charge: 0,
      wastage: 0,
      stone_value: 0,
      additional_details_value: 0,
      selling_price: 0,
      error: "Error calculating price",
    };
  }
};

const createProductSKUCode = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const prefix = req.query.prefix;

    if (!prefix) {
      await t.rollback();
      return commonService.badRequest(res, "Prefix query param is required");
    }

    // Pass pad=4 or higher
    const productCode = await generateProductSKUCode(prefix, { pad: 4 });

    await t.commit();
    return commonService.createdResponse(res, productCode);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Main Create Product API
const createProduct = async (req, res) => {
  try {
    const requiredFields = [
      "product_name",
      "description",
      "vendor_id",
      "material_type_id",
      "category_id",
      "subcategory_id",
      "grn_id",
      "hsn_code",
      "purity",
      "product_type",
      "variation_type",
    ];

    // Validation
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return commonService.badRequest(res, message.failure.requiredFields);
      }
    }

    // Product SKU validation
    if (req.body.sku_id) {
      const existingSku = await models.Product.findOne({
        where: { sku_id: req.body.sku_id },
        raw: true,
      });

      if (existingSku) {
        return commonService.badRequest(
          res,
          `Product SKU "${req.body.sku_id}" already exists`
        );
      }
    }

    const { item_details, ...productData } = req.body;

    const result = await sequelize.transaction(async (t) => {
      // Create the product
      const product = await models.Product.create(
        { ...productData },
        { transaction: t }
      );

      // Wipe old add-ons and variants for this product (if any)
      await models.ProductAddOn.destroy({
        where: { product_id: product.id },
        force: true, // Hard delete
        transaction: t,
      });

      await models.ProductVariant.destroy({
        where: { product_id: product.id },
        force: true, // Hard delete
        transaction: t,
      });

      // Create item details
      await createItemDetails(product.id, item_details, t);

      const items = await models.ProductItemDetail.findAll({
        where: { product_id: product.id },
        transaction: t,
      });

      const summary = computeSummaries(items, product.product_type);
      await product.update(summary, { transaction: t });

      return product;
    });

    const fullProduct = await getProductWithDetails(result.id);
    return commonService.createdResponse(res, fullProduct);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Helper: Create Item Details & Nested Additional Details
const createItemDetails = async (productId, itemDetails, t) => {
  for (const d of itemDetails || []) {
    const { additional_details: adds = [], ...fields } = d;

    // Create product item detail
    const item = await models.ProductItemDetail.create(
      { ...fields, product_id: productId },
      { transaction: t }
    );

    // Insert nested additional details, if any
    if (Array.isArray(adds) && adds.length > 0) {
      const addPayload = adds.map((a) => ({
        ...a,
        item_detail_id: item.id,
        product_id: productId,
      }));

      await models.ProductAdditionalDetail.bulkCreate(addPayload, {
        transaction: t,
      });
    }
  }
};

const getProductWithDetails = async (productId) => {
  const [product, items, adds] = await Promise.all([
    models.Product.findByPk(productId),
    models.ProductItemDetail.findAll({
      where: { product_id: productId },
      order: [["id", "ASC"]],
    }),
    models.ProductAdditionalDetail.findAll({
      where: { product_id: productId },
      order: [["id", "ASC"]],
    }),
  ]);

  const addsByItem = adds.reduce((acc, a) => {
    const key = String(a.item_detail_id);
    (acc[key] = acc[key] || []).push(a);
    return acc;
  }, {});

  const itemsWithAdds = items.map((it) => ({
    ...it.get({ plain: true }),
    additional_details: addsByItem[it.id] || [],
  }));

  return {
    product,
    item_details: itemsWithAdds,
  };
};

// Helper: compute totals
const computeSummaries = (items = [], type) => {
  let totalWeight = 0,
    totalQty = 0,
    totalValue = 0;

  for (const it of items) {
    const net = +it?.net_weight || 0;
    const qty = +it?.quantity || 0;
    const rate = +it?.rate_per_gram || 0;
    const base = +it?.base_price || 0;

    totalWeight += net;
    totalQty += qty;
    totalValue += base || (type === "Weight Based" ? rate * net : rate * qty);
  }

  return {
    total_grn_value: +totalValue.toFixed(2),
    total_products: totalQty || items.length || 0,
    remaining_weight: +totalWeight.toFixed(3),
  };
};

// Get all products with pagination and filtering
const getAllProducts = async (req, res) => {
  try {
    const {
      search = "",
      category_id,
      subcategory_id,
      vendor_id,
      material_type_id,
      product_type,
      is_published,
      sort_by = "created_at",
      sort_order = "DESC",
    } = req.query;

    const searchConditions = buildSearchCondition(search, [
      "product_name",
      "description",
      "product_code",
      "sku_id",
      "hsn_code",
    ]);

    // Build where conditions
    const whereConditions = {
      ...searchConditions,
      ...(category_id && { category_id: parseInt(category_id) }),
      ...(subcategory_id && { subcategory_id: parseInt(subcategory_id) }),
      ...(vendor_id && { vendor_id: parseInt(vendor_id) }),
      ...(material_type_id && { material_type_id: parseInt(material_type_id) }),
      ...(product_type && { product_type }),
      ...(is_published !== undefined && {
        is_published: is_published === "true",
      }),
    };

    // Get all products without pagination
    const products = await models.Product.findAll({
      where: whereConditions,
      order: [[sort_by, sort_order.toUpperCase()]],
      distinct: true,
    });

    return commonService.okResponse(res, { products });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateSkuId = async (req, res) => {
  try {
    const { branch_no } = req.query || {};

    if (!branch_no || String(branch_no).trim() === "") {
      return commonService.badRequest(res, "branch_no is required");
    }

    // Preserve underscores in branch_no by splitting into parts
    const parts = String(branch_no)
      .split("_")
      .map((p) => p.trim())
      .filter((p) => p !== "");

    // Generate <branch_no>_NNN sequence
    const skuId = await generateUniqueCode(models.Product, "sku_id", parts, {
      pad: 3,
      separator: "_",
    });

    return commonService.okResponse(res, { sku_id: skuId });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Light search for Add-On/product search box
const getProductAddonList = async (req, res) => {
  try {
    const { search, sku_id, product_ids } = req.query;

    let base = `
      FROM products p
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN "categories" c ON c.id = p.category_id
      LEFT JOIN "subcategories" s ON s.id = p.subcategory_id
      WHERE 1=1`;

    const replacements = {};

    if (sku_id) {
      base += ` AND p.sku_id ILIKE :sku_id`;
      replacements.sku_id = sku_id;
    }

    if (search) {
      const like = `%${search}%`;
      base += ` AND (
        p.sku_id ILIKE :like OR
        p.product_name ILIKE :like OR
        p.description ILIKE :like
      )`;
      replacements.like = like;
    }

    // Product IDs filter (supports multiple IDs)
    if (product_ids) {
      let ids = product_ids;

      if (typeof ids === "string") {
        if (ids.trim().startsWith("[") && ids.trim().endsWith("]")) {
          ids = JSON.parse(ids);
        } else {
          ids = ids
            .split(",")
            .map((n) => Number(n.trim()))
            .filter(Boolean);
        }
      }

      if (typeof ids === "number") ids = [ids];

      if (Array.isArray(ids) && ids.length > 0) {
        base += ` AND p.id IN (:product_ids)`;
        replacements.product_ids = ids;
      }
    }

    const select = `
      SELECT
        p.id,
        p.sku_id,
        p.product_name,
        p.description,
        p.image_urls,
        mt.material_type,
        mt.material_image_url,
        c.category_name,
        c.category_image_url,
        s.subcategory_name,
        s.subcategory_image_url`;

    const order = ` ORDER BY p.id DESC`;

    const dataQuery = `${select} ${base}${order}`;

    const [rows] = await sequelize.query(dataQuery, { replacements });

    return commonService.okResponse(res, { products: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Detailed product by product_id - mobile & view summary
const getProductById = async (req, res) => {
  try {
    const productId = +req.params.id;

    // Fetch product
    const row = await commonService.findById(models.Product, productId, res);
    if (!row) return;

    // Fetch material type name
    let materialTypeName = null;
    let materialPrice = 0;
    if (row.material_type_id) {
      const material = await sequelize.query(
        `SELECT material_type, material_price FROM "materialTypes" WHERE id = :id`,
        {
          replacements: { id: row.material_type_id },
          type: sequelize.QueryTypes.SELECT,
          plain: true,
        }
      );
      materialTypeName = material?.material_type || null;
      materialPrice = Number(material?.material_price || 0);
    }

    // fetch product item details & additional details
    const [itemDetails, additionalDetails] = await Promise.all([
      models.ProductItemDetail.findAll({
        where: { product_id: row.id },
        order: [["id", "ASC"]],
      }),
      models.ProductAdditionalDetail.findAll({
        where: { product_id: row.id },
        order: [["id", "ASC"]],
      }),
    ]);

    // Group additional details by item_detail_id
    const addsByItem = additionalDetails.reduce((acc, add) => {
      const key = String(add.item_detail_id);
      (acc[key] = acc[key] || []).push(add);
      return acc;
    }, {});

    // Fetch wishlist/cart rows for this product
    const userItems = await models.CartWishlistItem.findAll({
      where: {
        user_id: 0,
        product_id: row.id,
        deleted_at: null,
      },
      attributes: ["product_item_id", "is_wishlisted", "is_in_cart"],
    });

    // Build lookup map by product_item_id
    const itemStateMap = {};
    userItems.forEach((ui) => {
      itemStateMap[ui.product_item_id] = {
        is_wishlisted: Boolean(ui.is_wishlisted),
        is_in_cart: Boolean(ui.is_in_cart),
      };
    });

    // Build item_details with correct flags
    const itemsWithAdds = await Promise.all(
      itemDetails.map(async (it) => {
        const plainItem = it.get({ plain: true });

        // Keep your async function for single product view (response stays same)
        const priceDetails = await calculateSellingPrice(
          row.get({ plain: true }),
          plainItem,
          models
        );

        plainItem.price_details = priceDetails;

        const finalPrice = calculateFinalPriceRate(
          row.get({ plain: true }),
          plainItem,
          Number(materialPrice)
        );

        const itemState = itemStateMap[it.id] || {
          is_wishlisted: false,
          is_in_cart: false,
        };

        return {
          ...plainItem,
          additional_details: addsByItem[it.id] || [],
          price_details: {
            ...priceDetails,
            final_price_rate: finalPrice.final_price_rate,
          },
          is_wishlisted: itemState.is_wishlisted,
          is_in_cart: itemState.is_in_cart,
        };
      })
    );

    // Fetch add-on products
    let addon_products = [];
    const isAddOn =
      row.is_addOn === true || row.is_addOn === 1 || row.is_addOn === "true";

    if (isAddOn) {
      const [addonRows] = await sequelize.query(
        `
        SELECT
          pa.id,
          pa.addon_product_id,
          p.product_name,
          p.sku_id,
          p.image_urls
        FROM "productAddOns" pa
        JOIN products p ON p.id = pa.addon_product_id
        WHERE pa.product_id = :pid
        ORDER BY pa.id ASC
        `,
        { replacements: { pid: row.id } }
      );
      addon_products = addonRows;
    }

    // Fetch variant details
    const [variantDetails] = await sequelize.query(
      `
      SELECT
        pv.variant_id,
        v.variant_type,
        COALESCE(
          json_agg(
            json_build_object('id', vv.id, 'value', vv.value)
            ORDER BY vv.id
          ) FILTER (WHERE vv.id IS NOT NULL),
          '[]'::json
        ) AS values
      FROM "product_variants" pv
      JOIN variants v ON v.id = pv.variant_id AND v.deleted_at IS NULL
      LEFT JOIN "variantValues" vv ON vv.id = ANY(pv.variant_type_ids) AND vv.deleted_at IS NULL
      WHERE pv.product_id = :pid AND pv.deleted_at IS NULL
      GROUP BY pv.variant_id, v.variant_type
      ORDER BY pv.variant_id ASC
      `,
      { replacements: { pid: row.id } }
    );

    return commonService.okResponse(res, {
      product: {
        ...row.get({ plain: true }),
        material_type_name: materialTypeName,
        material_price: materialPrice,
      },
      item_details: itemsWithAdds,
      addon_products,
      variant_details: variantDetails,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update Product API
const updateProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { item_details = [], ...productData } = req.body;

    // 1. Update the main product
    const product = await models.Product.findByPk(id, { transaction: t });
    if (!product) {
      await t.rollback();
      return commonService.notFound(res, "Product not found");
    }

    await product.update(productData, { transaction: t });

    // 2. Delete all existing item details, additional details, pdt add ons and variant
    await models.ProductAdditionalDetail.destroy({
      where: { product_id: id },
      transaction: t,
      force: true,
    });

    await models.ProductItemDetail.destroy({
      where: { product_id: id },
      transaction: t,
      force: true,
    });

    await models.ProductAddOn.destroy({
      where: { product_id: id },
      force: true,
      transaction: t,
    });

    await models.ProductVariant.destroy({
      where: { product_id: id },
      force: true,
      transaction: t,
    });

    // 3. Create new item details and additional details
    if (Array.isArray(item_details)) {
      for (const itemData of item_details) {
        const { additional_details = [], ...itemFields } = itemData;

        // Create new item
        const item = await models.ProductItemDetail.create(
          { ...itemFields, product_id: id },
          { transaction: t }
        );

        // Create additional details for this item
        if (
          Array.isArray(additional_details) &&
          additional_details.length > 0
        ) {
          const addDetails = additional_details.map((addDetail) => ({
            ...addDetail,
            item_detail_id: item.id,
            product_id: id,
          }));

          await models.ProductAdditionalDetail.bulkCreate(addDetails, {
            transaction: t,
            validate: true,
          });
        }
      }
    }

    // 4. Recalculate and update summary
    const items = await models.ProductItemDetail.findAll({
      where: { product_id: id },
      transaction: t,
    });

    const summary = computeSummaries(items, product.product_type);
    await product.update(summary, { transaction: t });

    await t.commit();

    // 5. Return the updated product with all details
    const fullProduct = await getProductWithDetails(id);
    return commonService.okResponse(res, fullProduct);
  } catch (err) {
    await t.rollback();
    console.error("Error updating product:", err);
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const productId = req.params.id;

    // Get product
    const product = await commonService.findById(models.Product, productId, res);
    if (!product) {
      await t.rollback();
      return;
    }

    // Get all item details of the product
    await models.ProductItemDetail.findAll({
      where: { product_id: productId },
      transaction: t,
    });

    // Delete Additional Details (soft)
    await models.ProductAdditionalDetail.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    // Delete Item Details (soft)
    await models.ProductItemDetail.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    // Delete Add Ons (soft)
    await models.ProductAddOn.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    // Delete Product Variants (soft)
    await models.ProductVariant.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    // Finally delete the product (soft)
    await product.destroy({ transaction: t });

    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Get details for Web list page (with filters and search)  (RESPONSE UNCHANGED)
// Internal optimized: batch load material + additional details and use sync price calc
const getAllProductDetails = async (req, res) => {
  try {
    const {
      material_type_id,
      category_id,
      subcategory_id,
      grn_id,
      ref_no_id,
      search,
      branch_id,
      variant_type_ids,
      stock,
      page,
      limit,
    } = req.query;

    const usePagination = page !== undefined || limit !== undefined;

    const pageNum = usePagination ? parseInt(page || 1, 10) : null;
    const limitNum = usePagination ? parseInt(limit || 10, 10) : null;
    const offset = usePagination ? (pageNum - 1) * limitNum : null;

    // COMMON WHERE CLAUSE
    let whereClause = `
      WHERE p.status = 'Active'
      AND p.deleted_at IS NULL
    `;

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

    if (variant_type_ids) {
      const typeIds = variant_type_ids
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter(Boolean);

      if (typeIds.length) {
        whereClause += `
          AND EXISTS (
            SELECT 1
            FROM product_variants pv
            WHERE pv.product_id = p.id
            AND pv.variant_type_ids && ARRAY[${typeIds.join(",")}]::integer[]
          )
        `;
      }
    }

    // Add stock filtering to WHERE clause
    if (stock === "stock_in_hand") {
      whereClause += `
        AND EXISTS (
          SELECT 1
          FROM "productItemDetails" pid_stock
          WHERE pid_stock.product_id = p.id
          AND pid_stock.quantity > 0
          AND pid_stock.deleted_at IS NULL
        )
      `;
    }

    if (stock === "out_of_stock") {
      whereClause += `
       AND EXISTS (
        SELECT 1
        FROM "productItemDetails" pid_sold
        WHERE pid_sold.product_id = p.id
        AND pid_sold.quantity = 0
        AND pid_sold.stock_out_reason = 'SOLD'
        AND pid_sold.deleted_at IS NULL
      )

      -- Exclude transferred-only products
      AND NOT EXISTS (
        SELECT 1
        FROM "productItemDetails" pid_tr
        WHERE pid_tr.product_id = p.id
        AND pid_tr.quantity = 0
        AND pid_tr.stock_out_reason = 'TRANSFERRED'
        AND pid_tr.deleted_at IS NULL
      )

      -- Must be invoiced
      AND EXISTS (
        SELECT 1
        FROM sales_invoice_bill_items sii
        JOIN sales_invoice_bills sib
          ON sib.id = sii.invoice_bill_id
          AND sib.deleted_at IS NULL
          AND sib.status = 'Invoice'
          AND sib.is_active = true
        WHERE sii.deleted_at IS NULL
          AND sii.product_id = p.id
      )
      `;
    }

    if (search) {
      const like = `%${search}%`;
      whereClause += `
        AND (
          p.product_name ILIKE :like OR
          p.product_code ILIKE :like OR
          p.sku_id ILIKE :like OR
          p.description ILIKE :like OR
          p.hsn_code ILIKE :like OR
          p.product_type::text ILIKE :like OR
          p.variation_type::text ILIKE :like OR
          mt.material_type ILIKE :like OR
          b.branch_name ILIKE :like OR
          g.grn_no ILIKE :like OR
          gi.ref_no ILIKE :like
        )
      `;
      replacements.like = like;
    }

    // COUNT QUERY (only if pagination is used)
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
        ${whereClause}
      `;

      const [countResult] = await sequelize.query(countQuery, { replacements });
      total = Number(countResult[0]?.total || 0);
    }

    // MAIN QUERY
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
        g.grn_date,
        g.total_gross_wt_in_g,
        g.total_amount AS grn_total_amount,
        gi.ref_no AS grn_ref_no,
        gi.gross_wt_in_g AS grn_gross_weight,
        gi.net_wt_in_g AS grn_net_weight,
        gi.quantity AS grn_quantity,
        gi.type AS grn_item_type,
        mt.material_type,
        mt.material_price,
        COALESCE(
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', pv.variant_id,
                'type_ids', pv.variant_type_ids
              )
            )
            FROM product_variants pv
            WHERE pv.product_id = p.id
            AND pv.variant_id IS NOT NULL
          ),
          '[]'::json
        ) AS variants,
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
        p."is_addOn",
        p.total_grn_value,
        p.total_products,
        p.remaining_weight,
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
        sc.subcategory_name,
        g.grn_no, g.grn_date, g.total_gross_wt_in_g, g.total_amount,
        gi.ref_no, gi.gross_wt_in_g, b.branch_name, gi.net_wt_in_g, gi.quantity, gi.type
      ORDER BY p.id DESC
    `;

    if (usePagination) {
      query += ` LIMIT :limit OFFSET :offset`;
    }

    const [rows] = await sequelize.query(query, {
      replacements: {
        ...replacements,
        ...(usePagination ? { limit: limitNum, offset } : {}),
      },
    });

    let products = rows.map((row) => ({
      ...row,
      variants: row.variants || [],
    }));

    // Fetch item details with additional details for all products
    if (products.length) {
      const productIds = products.map((p) => p.id);

      const itemWhere = { product_id: productIds, deleted_at: null };

      if (!stock) itemWhere.quantity = { [Op.gt]: 0 };
      if (stock === "stock_in_hand") itemWhere.quantity = { [Op.gt]: 0 };
      if (stock === "out_of_stock") {
        itemWhere.quantity = 0;
        itemWhere.stock_out_reason = "SOLD";
      };

      const itemDetails = await models.ProductItemDetail.findAll({
        where: itemWhere,
        order: [["id", "ASC"]],
        raw: true,
      });

      const itemIds = itemDetails.map((it) => it.id);

      const additionalDetails = itemIds.length
        ? await models.ProductAdditionalDetail.findAll({
            where: { item_detail_id: itemIds },
            raw: true,
          })
        : [];

      const addsByItem = additionalDetails.reduce((acc, add) => {
        (acc[add.item_detail_id] ??= []).push(add);
        return acc;
      }, {});

      const itemsByProduct = itemDetails.reduce((acc, item) => {
        (acc[item.product_id] ??= []).push(item);
        return acc;
      }, {});

      // Material prices map (batch)
      const materialIds = [
        ...new Set(products.map((p) => p.material_type_id).filter(Boolean)),
      ];

      const materialPriceMap = {};
      if (materialIds.length) {
        const materials = await models.MaterialType.findAll({
          where: { id: materialIds },
          attributes: ["id", "material_price"],
          raw: true,
        });

        materials.forEach((m) => {
          materialPriceMap[m.id] = Number(m.material_price || 0);
        });
      }

      const itemsWithPrices = products.map((product) => {
        const productItems = itemsByProduct[product.id] || [];

        const enrichedItems = productItems.map((item) => {
          const priceDetails = calculateSellingPriceSync(
            product,
            item,
            addsByItem[item.id] || [],
            materialPriceMap[product.material_type_id] || 0
          );

          return {
            ...item,
            additional_details: addsByItem[item.id] || [],
            price_details: priceDetails,
          };
        });

        return {
          ...product,
          item_details: enrichedItems,
        };
      });

      products = itemsWithPrices;
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

/*
// Get details for Web list page (with filters and search) - OPTIMIZED (RESPONSE UNCHANGED)
const newGetAllProductDetails = async (req, res) => {
  try {
    const {
      material_type_id,
      category_id,
      subcategory_id,
      grn_id,
      ref_no_id,
      search,
      branch_id,
      variant_type_ids,
      stock,
      page,
      limit,
    } = req.query;

    const usePagination = page !== undefined || limit !== undefined;
    const pageNum = usePagination ? parseInt(page || 1, 10) : null;
    const limitNum = usePagination ? parseInt(limit || 10, 10) : null;
    const offset = usePagination ? (pageNum - 1) * limitNum : null;

    // Build base WHERE for products table only (no JOINs for performance)
    let whereClause = `
      WHERE p.status = 'Active'
      AND p.deleted_at IS NULL
    `;

    const replacements = {};

    if (material_type_id) {
      whereClause += ` AND p.material_type_id = :material_type_id`;
      replacements.material_type_id = +material_type_id;
    }

    if (category_id) {
      whereClause += ` AND p.category_id = :category_id`;
      replacements.category_id = +category_id;
    }

    if (subcategory_id) {
      whereClause += ` AND p.subcategory_id = :subcategory_id`;
      replacements.subcategory_id = +subcategory_id;
    }

    if (branch_id) {
      whereClause += ` AND p.branch_id = :branch_id`;
      replacements.branch_id = +branch_id;
    }

    if (grn_id) {
      whereClause += ` AND p.grn_id = :grn_id`;
      replacements.grn_id = +grn_id;
    }

    if (ref_no_id) {
      whereClause += ` AND p.ref_no_id = :ref_no_id`;
      replacements.ref_no_id = +ref_no_id;
    }

    if (variant_type_ids) {
      const typeIds = variant_type_ids
        .split(",")
        .map((id) => +id.trim())
        .filter(Boolean);

      if (typeIds.length) {
        whereClause += `
          AND EXISTS (
            SELECT 1
            FROM product_variants pv
            WHERE pv.product_id = p.id
            AND pv.variant_type_ids && ARRAY[${typeIds.join(",")}]::integer[]
          )
        `;
      }
    }

    // Stock filtering
    if (stock === "stock_in_hand") {
      whereClause += `
        AND EXISTS (
          SELECT 1 FROM "productItemDetails" pid
          WHERE pid.product_id = p.id
          AND pid.quantity > 0
          AND pid.deleted_at IS NULL
        )
      `;
    }

    if (stock === "out_of_stock") {
      whereClause += `
        AND EXISTS (
          SELECT 1 FROM "productItemDetails" pid
          WHERE pid.product_id = p.id
          AND pid.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM "productItemDetails" pid
          WHERE pid.product_id = p.id
          AND pid.quantity > 0 AND pid.stock_out_reason = 'SOLD'
          AND pid.deleted_at IS NULL
        )
      `;
    }

    // Only add search JOINs if search is provided
    let searchJoins = "";
    if (search) {
      searchJoins = `
        LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
        LEFT JOIN branches b ON b.id = p.branch_id
        LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
        LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
      `;

      const like = `%${search}%`;
      whereClause += `
        AND (
          p.product_name ILIKE :like OR
          p.product_code ILIKE :like OR
          p.sku_id ILIKE :like OR
          p.description ILIKE :like OR
          p.hsn_code ILIKE :like OR
          p.product_type::text ILIKE :like OR
          p.variation_type::text ILIKE :like OR
          mt.material_type ILIKE :like OR
          b.branch_name ILIKE :like OR
          g.grn_no ILIKE :like OR
          gi.ref_no ILIKE :like
        )
      `;
      replacements.like = like;
    }

    let total = null;
    let paginatedProductIds = [];

    if (usePagination) {
      // COUNT query
      const countQuery = `
        SELECT COUNT(DISTINCT p.id) AS total
        FROM products p
        ${searchJoins}
        ${whereClause}
      `;

      const [countResult] = await sequelize.query(countQuery, { replacements });
      total = Number(countResult[0]?.total || 0);

      if (total === 0) {
        return commonService.okResponse(res, {
          products: [],
          pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 },
        });
      }

      // Get paginated product IDs only
      const idQuery = `
        SELECT DISTINCT p.id
        FROM products p
        ${searchJoins}
        ${whereClause}
        ORDER BY p.id DESC
        LIMIT :limit OFFSET :offset
      `;

      const [idRows] = await sequelize.query(idQuery, {
        replacements: { ...replacements, limit: limitNum, offset },
      });

      paginatedProductIds = idRows.map((r) => r.id);

      if (!paginatedProductIds.length) {
        return commonService.okResponse(res, {
          products: [],
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
        });
      }
    }

    // Build WHERE clause for main query
    let mainWhereClause = `WHERE p.status = 'Active' AND p.deleted_at IS NULL`;
    const mainReplacements = {};

    if (usePagination && paginatedProductIds.length) {
      mainWhereClause += ` AND p.id IN (:productIds)`;
      mainReplacements.productIds = paginatedProductIds;
    } else if (!usePagination) {
      Object.assign(mainReplacements, replacements);
      mainWhereClause = whereClause;
    }

    const query = `
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
        p.subcategory_id,
        p.ref_no_id,
        p.grn_id,
        p.branch_id,
        p.sku_id,
        p.hsn_code,
        p.purity,
        p.product_type,
        p.variation_type,
        p.product_variations,
        p."is_addOn",
        p.total_grn_value,
        p.total_products,
        p.remaining_weight,
        p.created_at,
        p.updated_at,
        ct.category_name,
        ct.category_image_url,
        sc.subcategory_name,
        mt.material_type,
        mt.material_price,
        b.branch_name,
        g.grn_no,
        g.grn_date,
        g.total_gross_wt_in_g,
        g.total_amount AS grn_total_amount,
        gi.ref_no AS grn_ref_no,
        gi.gross_wt_in_g AS grn_gross_weight,
        gi.net_wt_in_g AS grn_net_weight,
        gi.quantity AS grn_quantity,
        gi.type AS grn_item_type
      FROM products p
      LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories ct ON ct.id = p.category_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
      LEFT JOIN branches b ON b.id = p.branch_id
      ${usePagination ? mainWhereClause : whereClause}
      ORDER BY p.id DESC
    `;

    const [rows] = await sequelize.query(query, {
      replacements: usePagination ? mainReplacements : replacements,
    });

    if (!rows.length) {
      const emptyResponse = { products: [] };
      if (usePagination) {
        emptyResponse.pagination = {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        };
      }
      return commonService.okResponse(res, emptyResponse);
    }

    const productIds = rows.map((p) => p.id);

    // Fetch variants in one query
    const [variantRows] = await sequelize.query(
      `
      SELECT
        pv.product_id,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', pv.variant_id,
            'type_ids', pv.variant_type_ids
          )
        ) AS variants
      FROM product_variants pv
      WHERE pv.product_id IN (:productIds)
      AND pv.variant_id IS NOT NULL
      GROUP BY pv.product_id
      `,
      { replacements: { productIds } }
    );

    const variantMap = {};
    variantRows.forEach((row) => {
      variantMap[row.product_id] = row.variants || [];
    });

    // Fetch item details
    const itemWhere = { product_id: productIds };

    if (!stock || stock === "stock_in_hand") {
      itemWhere.quantity = { [Op.gt]: 0 };
    }
    if (stock === "out_of_stock") {
      itemWhere.quantity = 0;
    }

    const itemDetails = await models.ProductItemDetail.findAll({
      where: itemWhere,
      order: [["id", "ASC"]],
      raw: true,
    });

    // Fetch additional details
    const itemIds = itemDetails.map((it) => it.id);
    const additionalDetails = itemIds.length
      ? await models.ProductAdditionalDetail.findAll({
          where: { item_detail_id: itemIds },
          raw: true,
        })
      : [];

    const addsByItem = additionalDetails.reduce((acc, add) => {
      (acc[add.item_detail_id] ??= []).push(add);
      return acc;
    }, {});

    const itemsByProduct = itemDetails.reduce((acc, item) => {
      (acc[item.product_id] ??= []).push(item);
      return acc;
    }, {});

    // Batch fetch all material prices once
    const materialIds = [
      ...new Set(rows.map((p) => p.material_type_id).filter(Boolean)),
    ];
    const materialPriceMap = {};

    if (materialIds.length) {
      const materials = await models.MaterialType.findAll({
        where: { id: materialIds },
        attributes: ["id", "material_price"],
        raw: true,
      });
      materials.forEach((m) => {
        materialPriceMap[m.id] = parseFloat(m.material_price) || 0;
      });
    }

    // Calculate totals and prices (RESPONSE SAME)
    const products = rows.map((row) => {
      const productItems = itemsByProduct[row.id] || [];

      let totalQuantity = 0;
      let totalWeight = 0;
      let variationCount = productItems.length;

      const itemsWithPrices = productItems.map((item) => {
        const netWeight = parseFloat(item.net_weight) || 0;
        const qty = parseFloat(item.quantity) || 0;

        totalQuantity += qty;
        totalWeight += qty * netWeight;

        const priceDetails = calculateSellingPriceSync(
          row,
          item,
          addsByItem[item.id] || [],
          materialPriceMap[row.material_type_id] || 0
        );

        return {
          ...item,
          additional_details: addsByItem[item.id] || [],
          price_details: priceDetails,
        };
      });

      return {
        ...row,
        variants: variantMap[row.id] || [],
        total_quantity: totalQuantity,
        total_weight: totalWeight,
        variation_count: variationCount,
        item_details: itemsWithPrices,
      };
    });

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
    console.error("Error in newGetAllProductDetails:", err);
    return commonService.handleError(res, err);
  }
};

*/

const searchProductBySkuNew = async (req, res) => {
  try {
    const { sku, branch_id } = req.query;

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    // CASE 1 → No SKU
    if (!sku || sku.trim() === "") {
      const [allProducts, allItems] = await Promise.all([
        models.Product.findAll({ where: { branch_id }, raw: true }),
        models.ProductItemDetail.findAll({
          where: { quantity: { [Op.gt]: 0 }, is_visible: true },
          raw: true,
        }),
      ]);

      // Batch material prices
      const materialIds = [
        ...new Set(allProducts.map((p) => p.material_type_id).filter(Boolean)),
      ];
      const materials = materialIds.length
        ? await models.MaterialType.findAll({
            where: { id: materialIds },
            attributes: ["id", "material_price"],
            raw: true,
          })
        : [];
      const materialPriceMap = {};
      materials.forEach((m) => (materialPriceMap[m.id] = Number(m.material_price || 0)));

      // Batch additional details
      const itemIds = allItems.map((i) => i.id);
      const allAdds = itemIds.length
        ? await models.ProductAdditionalDetail.findAll({
            where: { item_detail_id: itemIds },
            raw: true,
          })
        : [];
      const addsByItem = {};
      allAdds.forEach((a) => ((addsByItem[a.item_detail_id] ??= []).push(a)));

      const output = allItems
        .map((item) => {
          const product = allProducts.find((p) => p.id === item.product_id);
          if (!product) return null;

          const priceDetails = calculateSellingPriceSync(
            product,
            item,
            addsByItem[item.id] || [],
            materialPriceMap[product.material_type_id] || 0
          );

          return {
            sku_id: item.sku_id || product.sku_id,
            product_name: product.product_name,
            product_variations: product.product_variations,
            purity: product.purity,
            branch_id: product.branch_id,
            product_id: product.id,
            product_item_details_id: item.id,
            quantity: item.quantity,
            hsn_code: product.hsn_code,
            base_price: item.base_price,
            gross_weight: item.gross_weight,
            net_weight: item.net_weight,
            product_item_wastage: item.wastage,
            ...priceDetails,
          };
        })
        .filter(Boolean);

      return commonService.okResponse(res, output);
    }

    // CASE 2 → SKU provided
    const [directProduct, itemDetail] = await Promise.all([
      models.Product.findOne({ where: { sku_id: sku, branch_id }, raw: true }),
      models.ProductItemDetail.findOne({
        where: { sku_id: sku, quantity: { [Op.gt]: 0 }, is_visible: true },
        raw: true,
      }),
    ]);

    let product = null;
    let items = [];

    if (directProduct) {
      product = directProduct;
      items = await models.ProductItemDetail.findAll({
        where: { product_id: directProduct.id, quantity: { [Op.gt]: 0 }, is_visible: true },
        raw: true,
      });
    } else if (itemDetail) {
      product = await models.Product.findOne({
        where: { id: itemDetail.product_id, branch_id },
        raw: true,
      });
      items = product ? [itemDetail] : [];
    }

    if (!product || items.length === 0) {
      return commonService.notFound(res, "No in-stock product found for given SKU");
    }

    // Batch material + adds for this one product
    const material = await models.MaterialType.findByPk(product.material_type_id, { raw: true });
    const materialPrice = Number(material?.material_price || 0);

    const itemIds = items.map((i) => i.id);
    const adds = itemIds.length
      ? await models.ProductAdditionalDetail.findAll({
          where: { item_detail_id: itemIds },
          raw: true,
        })
      : [];
    const addsByItem = {};
    adds.forEach((a) => ((addsByItem[a.item_detail_id] ??= []).push(a)));

    const flatResponse = items
      .filter((it) => Number(it.quantity || 0) > 0)
      .map((item) => {
        const priceDetails = calculateSellingPriceSync(
          product,
          item,
          addsByItem[item.id] || [],
          materialPrice
        );

        return {
          sku_id: item.sku_id || product.sku_id,
          product_name: product.product_name,
          product_variations: product.product_variations,
          purity: product.purity,
          branch_id: product.branch_id,
          product_id: product.id,
          product_item_details_id: item.id,
          quantity: item.quantity,
          hsn_code: product.hsn_code,
          base_price: item.base_price,
          gross_weight: item.gross_weight,
          net_weight: item.net_weight,
          product_item_wastage: item.wastage,
          ...priceDetails,
        };
      });

    return commonService.okResponse(res, flatResponse);
  } catch (error) {
    console.error("Error searching products by SKU:", error);
    return commonService.handleError(res, error);
  }
};
const searchProductBySkuStockTransfer = async (req, res) => {
  try {
    const { sku, branch_id } = req.query;

    if (!branch_id) {
      return commonService.badRequest(res, "branch_id is required");
    }

    // CASE 1 → No SKU
    if (!sku || sku.trim() === "") {
      const [allProducts, allItems] = await Promise.all([
        models.Product.findAll({ where: { branch_id }, raw: true }),
        models.ProductItemDetail.findAll({
          where: { quantity: { [Op.gt]: 0 }, is_visible: true },
          raw: true,
        }),
      ]);

      // Batch material prices and names
      const materialIds = [
        ...new Set(allProducts.map((p) => p.material_type_id).filter(Boolean)),
      ];
      const materials = materialIds.length
        ? await models.MaterialType.findAll({
            where: { id: materialIds },
            attributes: ["id", "material_price", "material_type"],
            raw: true,
          })
        : [];
      const materialPriceMap = {};
      const materialNameMap = {};
      materials.forEach((m) => {
        materialPriceMap[m.id] = Number(m.material_price || 0);
        materialNameMap[m.id] = m.material_type || null;
      });

      // Batch categories
      const categoryIds = [
        ...new Set(allProducts.map((p) => p.category_id).filter(Boolean)),
      ];
      const categories = categoryIds.length
        ? await models.Category.findAll({
            where: { id: categoryIds },
            attributes: ["id", "category_name"],
            raw: true,
          })
        : [];
      const categoryNameMap = {};
      categories.forEach((c) => (categoryNameMap[c.id] = c.category_name || null));

      // Batch subcategories
      const subcategoryIds = [
        ...new Set(allProducts.map((p) => p.subcategory_id).filter(Boolean)),
      ];
      const subcategories = subcategoryIds.length
        ? await models.Subcategory.findAll({
            where: { id: subcategoryIds },
            attributes: ["id", "subcategory_name"],
            raw: true,
          })
        : [];
      const subcategoryNameMap = {};
      subcategories.forEach((s) => (subcategoryNameMap[s.id] = s.subcategory_name || null));

      // Batch additional details
      const itemIds = allItems.map((i) => i.id);
      const allAdds = itemIds.length
        ? await models.ProductAdditionalDetail.findAll({
            where: { item_detail_id: itemIds },
            raw: true,
          })
        : [];
      const addsByItem = {};
      allAdds.forEach((a) => ((addsByItem[a.item_detail_id] ??= []).push(a)));

      const output = allItems
        .map((item) => {
          const product = allProducts.find((p) => p.id === item.product_id);
          if (!product) return null;

          const priceDetails = calculateSellingPriceSync(
            product,
            item,
            addsByItem[item.id] || [],
            materialPriceMap[product.material_type_id] || 0
          );

          return {
            sku_id: item.sku_id || product.sku_id,
            product_name: product.product_name,
            product_variations: product.product_variations,
            purity: product.purity,
            branch_id: product.branch_id,
            product_id: product.id,
            product_item_details_id: item.id,
            quantity: item.quantity,
            hsn_code: product.hsn_code,
            base_price: item.base_price,
            gross_weight: item.gross_weight,
            net_weight: item.net_weight,
            product_item_wastage: item.wastage,
            material_type_id: product.material_type_id,
            material_type: materialNameMap[product.material_type_id] || null,
            category_id: product.category_id,
            category_name: categoryNameMap[product.category_id] || null,
            subcategory_id: product.subcategory_id,
            subcategory_name: subcategoryNameMap[product.subcategory_id] || null,
            ...priceDetails,
          };
        })
        .filter(Boolean);

      return commonService.okResponse(res, output);
    }

    // CASE 2 → SKU provided
    const [directProduct, itemDetail] = await Promise.all([
      models.Product.findOne({ where: { sku_id: sku, branch_id }, raw: true }),
      models.ProductItemDetail.findOne({
        where: { sku_id: sku, quantity: { [Op.gt]: 0 }, is_visible: true },
        raw: true,
      }),
    ]);

    let product = null;
    let items = [];

    if (directProduct) {
      product = directProduct;
      items = await models.ProductItemDetail.findAll({
        where: { product_id: directProduct.id, quantity: { [Op.gt]: 0 }, is_visible: true },
        raw: true,
      });
    } else if (itemDetail) {
      product = await models.Product.findOne({
        where: { id: itemDetail.product_id, branch_id },
        raw: true,
      });
      items = product ? [itemDetail] : [];
    }

    if (!product || items.length === 0) {
      return commonService.notFound(res, "No in-stock product found for given SKU");
    }

    // Batch material, category, subcategory + adds for this one product
    const [material, category, subcategory] = await Promise.all([
      product.material_type_id
        ? models.MaterialType.findByPk(product.material_type_id, { raw: true })
        : null,
      product.category_id
        ? models.Category.findByPk(product.category_id, { raw: true })
        : null,
      product.subcategory_id
        ? models.Subcategory.findByPk(product.subcategory_id, { raw: true })
        : null,
    ]);

    const materialPrice = Number(material?.material_price || 0);
    const materialTypeName = material?.material_type || null;
    const categoryName = category?.category_name || null;
    const subcategoryName = subcategory?.subcategory_name || null;

    const itemIds = items.map((i) => i.id);
    const adds = itemIds.length
      ? await models.ProductAdditionalDetail.findAll({
          where: { item_detail_id: itemIds },
          raw: true,
        })
      : [];
    const addsByItem = {};
    adds.forEach((a) => ((addsByItem[a.item_detail_id] ??= []).push(a)));

    const flatResponse = items
      .filter((it) => Number(it.quantity || 0) > 0)
      .map((item) => {
        const priceDetails = calculateSellingPriceSync(
          product,
          item,
          addsByItem[item.id] || [],
          materialPrice
        );

        return {
          sku_id: item.sku_id || product.sku_id,
          product_name: product.product_name,
          product_variations: product.product_variations,
          purity: product.purity,
          branch_id: product.branch_id,
          product_id: product.id,
          product_item_details_id: item.id,
          quantity: item.quantity,
          hsn_code: product.hsn_code,
          base_price: item.base_price,
          gross_weight: item.gross_weight,
          net_weight: item.net_weight,
          product_item_wastage: item.wastage,
          material_type_id: product.material_type_id,
          material_type: materialTypeName,
          category_id: product.category_id,
          category_name: categoryName,
          subcategory_id: product.subcategory_id,
          subcategory_name: subcategoryName,
          ...priceDetails,
        };
      });

    return commonService.okResponse(res, flatResponse);
  } catch (error) {
    console.error("Error searching products by SKU:", error);
    return commonService.handleError(res, error);
  }
};

// ORIGINAL async function kept (response unchanged)
const calculateSellingPrice = async (product, item, models) => {
  try {
    // 1. Get Material Rate Per Gram
    let materialRate;
    const material = await models.MaterialType.findByPk(
      product.material_type_id,
      { raw: true }
    );
    const materialPrice = parseFloat(material?.material_price) || 0;

    if (product.product_type === "Piece Rate") {
      const ratePerGram = parseFloat(item.rate_per_gram) || 0;
      materialRate = Math.max(ratePerGram, materialPrice);
    } else {
      materialRate = materialPrice;
    }

    const netWeight = parseFloat(item.net_weight) || 0;
    const materialContribution = materialRate * netWeight;

    const stoneValue = parseFloat(item.stone_value) || 0;

    const additionalDetails = await models.ProductAdditionalDetail.findAll({
      where: { item_detail_id: item.id },
      raw: true,
    });

    const additionalDetailsSum = additionalDetails.reduce((sum, detail) => {
      return sum + (parseFloat(detail.value) || 0);
    }, 0);

    let makingCharge = 0;
    const makingChargeValue = parseFloat(item.making_charge) || 0;
    switch (item.making_charge_type) {
      case "Per Gram":
        makingCharge = makingChargeValue * netWeight;
        break;
      case "Percentage":
        makingCharge = (makingChargeValue / 100) * materialContribution;
        break;
      case "Amount":
        makingCharge = makingChargeValue;
        break;
    }

    let wastage = 0;
    const wastageValue = parseFloat(item.wastage) || 0;
    switch (item.wastage_type) {
      case "Per Gram":
        wastage = wastageValue * netWeight;
        break;
      case "Percentage":
        wastage = (wastageValue / 100) * materialContribution;
        break;
      case "Amount":
        wastage = wastageValue;
        break;
    }

    const sellingPrice =
      materialContribution +
      makingCharge +
      wastage +
      stoneValue +
      additionalDetailsSum;

    return {
      material_rate_per_gram: materialRate,
      material_contribution: materialContribution,
      making_charge: makingCharge,
      wastage: wastage,
      stone_value: stoneValue,
      additional_details_value: additionalDetailsSum,
      selling_price: sellingPrice,
    };
  } catch (error) {
    console.error("Error in calculateSellingPrice:", error);
    return {
      material_rate_per_gram: 0,
      material_contribution: 0,
      making_charge: 0,
      wastage: 0,
      stone_value: 0,
      additional_details_value: 0,
      selling_price: 0,
      error: "Error calculating price",
    };
  }
};

// Update Product Status API
const updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status === undefined) {
      return commonService.badRequest(res, "Status is required");
    }

    const productData = await models.Product.findByPk(id);
    if (!productData) {
      return commonService.notFound(res, "Product not found");
    }

    await models.Product.update({ status }, { where: { id } });

    return commonService.okResponse(res, {
      message: "Product status updated successfully",
    });
  } catch (err) {
    console.error("Error updating product status:", err);
    return commonService.handleError(res, err);
  }
};

// List products for Website List (lightweight) (RESPONSE UNCHANGED)
const getProductsForWebsiteList = async (req, res) => {
  try {
    const userId = req.user?.id || 0;

    const {
      material_type_id,
      category_id,
      subcategory_id,
      min_price,
      max_price,
      sort_by = "best_seller",
      variant_type_id,
    } = req.query;

    let whereConditions = `
      WHERE
        p.is_published = true
        AND p.status = 'Active'
        AND p.deleted_at IS NULL
        AND pi.is_visible = true
        AND pi.deleted_at IS NULL
    `;

    const queryParams = [];

    if (material_type_id) {
      whereConditions += ` AND p.material_type_id = ?`;
      queryParams.push(material_type_id);
    }
    if (category_id) {
      whereConditions += ` AND p.category_id = ?`;
      queryParams.push(category_id);
    }
    if (subcategory_id) {
      whereConditions += ` AND p.subcategory_id = ?`;
      queryParams.push(subcategory_id);
    }

    // Variant Type ID Filtering
    let variantTypeIds = [];

    if (variant_type_id) {
      if (Array.isArray(req.query.variant_type_id)) {
        variantTypeIds = req.query.variant_type_id
          .map((id) => parseInt(id, 10))
          .filter((id) => !isNaN(id));
      } else {
        variantTypeIds = req.query.variant_type_id
          .split(",")
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id));
      }
    }

    if (variantTypeIds.length > 0) {
      whereConditions += ` AND EXISTS (
        SELECT 1
        FROM "product_variants" pv
        WHERE pv.product_id = p.id
          AND pv.variant_type_ids && ARRAY[${variantTypeIds.join(",")}]::integer[]
      )`;
    }

    let orderByClause = "ORDER BY p.created_at DESC";
    if (sort_by === "newest") orderByClause = "ORDER BY p.created_at DESC";

    const dynamicQuery = `
      SELECT
        p.id AS product_id,
        p.product_code,
        p.product_name,
        p.image_urls,
        p.material_type_id,
        p.product_type,
        p.category_id,
        c.category_name,
        p.subcategory_id,
        sc.subcategory_name,
        p.created_at,

        pi.id AS item_id,
        pi.rate_per_gram,
        pi.net_weight,
        pi.making_charge,
        pi.making_charge_type,
        pi.wastage,
        pi.wastage_type,
        pi.stone_value

      FROM products p
      INNER JOIN "productItemDetails" pi ON p.id = pi.product_id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
      ${whereConditions}
      ${orderByClause};
    `;

    const rows = await sequelize.query(dynamicQuery, {
      replacements: queryParams,
      type: sequelize.QueryTypes.SELECT,
    });

    if (!rows.length) {
      return res.status(200).json({
        statusCode: 200,
        message: "Success",
        data: [],
      });
    }

    const productIds = [...new Set(rows.map((r) => r.product_id))];

    // Fetch material prices in bulk
    const materialPrices = {};
    const uniqueMaterialIds = [...new Set(rows.map((r) => r.material_type_id))];
    if (uniqueMaterialIds.length > 0) {
      const materials = await sequelize.query(
        `SELECT id, material_price FROM "materialTypes" WHERE id IN (${uniqueMaterialIds
          .map(() => "?")
          .join(",")})`,
        {
          replacements: uniqueMaterialIds,
          type: sequelize.QueryTypes.SELECT,
        }
      );
      materials.forEach((m) => {
        materialPrices[m.id] = Number(m.material_price || 0);
      });
    }

    // Batch additional details for all items in this list
    const allItemIds = rows.map((r) => r.item_id);
    const allAdds = allItemIds.length
      ? await models.ProductAdditionalDetail.findAll({
          where: { item_detail_id: allItemIds },
          raw: true,
        })
      : [];
    const addsByItem = {};
    allAdds.forEach((a) => ((addsByItem[a.item_detail_id] ??= []).push(a)));

    // Cart/Wishlist flag
    const userCartWishlistItems = await models.CartWishlistItem.findAll({
      where: {
        user_id: userId,
        product_id: { [Op.in]: productIds },
        deleted_at: null,
      },
      attributes: [
        "product_id",
        "product_item_id",
        "order_item_type",
        "is_wishlisted",
        "is_in_cart",
      ],
      raw: true,
    });

    const cartWishlistMap = {};
    userCartWishlistItems.forEach((item) => {
      const key = `${item.product_id}-${item.product_item_id}`;
      cartWishlistMap[key] = {
        order_item_type: item.order_item_type,
        is_wishlisted: Boolean(item.is_wishlisted),
        is_in_cart: Boolean(item.is_in_cart),
      };
    });

    // Fetch variants
    const variantRows = await sequelize.query(
      `
      SELECT
        pv.product_id,
        pv.variant_id,
        v.variant_type,
        COALESCE(
          json_agg(
            json_build_object('id', vv.id, 'value', vv.value)
            ORDER BY vv.sort_order ASC
          ) FILTER (WHERE vv.id IS NOT NULL),
          '[]'::json
        ) AS values
      FROM "product_variants" pv
      JOIN variants v ON v.id = pv.variant_id AND v.deleted_at IS NULL
      LEFT JOIN "variantValues" vv ON vv.id = ANY(pv.variant_type_ids) AND vv.deleted_at IS NULL
      WHERE pv.product_id IN (:productIds)
        AND pv.deleted_at IS NULL
      GROUP BY pv.product_id, pv.variant_id, v.variant_type
      ORDER BY pv.product_id, pv.variant_id
    `,
      {
        replacements: { productIds: productIds.length ? productIds : [0] },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const variantMap = {};
    variantRows.forEach((row) => {
      if (!variantMap[row.product_id]) variantMap[row.product_id] = [];
      variantMap[row.product_id].push({
        id: row.variant_id,
        variant_type: row.variant_type,
        type_ids: row.values || [],
      });
    });

    // Process products
    const productMap = new Map();

    for (const row of rows) {
      const product = {
        id: row.product_id,
        product_code: row.product_code,
        product_name: row.product_name,
        image_urls: row.image_urls,
        material_type_id: row.material_type_id,
        category_id: row.category_id,
        category_name: row.category_name,
        subcategory_id: row.subcategory_id,
        subcategory_name: row.subcategory_name,
        product_type: row.product_type,
        created_at: row.created_at,
      };

      const item = {
        id: row.item_id,
        rate_per_gram: row.rate_per_gram,
        net_weight: row.net_weight,
        making_charge: row.making_charge,
        making_charge_type: row.making_charge_type,
        wastage: row.wastage,
        wastage_type: row.wastage_type,
        stone_value: row.stone_value,
      };

      // FAST: no await + no DB calls
      const materialPrice = materialPrices[row.material_type_id] || 0;
      const priceResult = calculateSellingPriceSync(
        product,
        item,
        addsByItem[row.item_id] || [],
        materialPrice
      );

      const sellingPrice = priceResult.selling_price;
      if (!sellingPrice || sellingPrice <= 0) continue;

      if (min_price && sellingPrice < parseFloat(min_price)) continue;
      if (max_price && sellingPrice > parseFloat(max_price)) continue;

      const basePriceDisplay = Number(sellingPrice.toFixed(2));

      const finalCalc = calculateFinalPriceRate(
        product,
        { ...item, price_details: priceResult },
        materialPrice
      );
      const finalPriceDisplay = Number(finalCalc.final_price_rate.toFixed(2));

      const key = `${product.id}-${item.id}`;
      const cartState = cartWishlistMap[key] || {
        order_item_type: null,
        is_wishlisted: false,
        is_in_cart: false,
      };

      const productEntry = {
        id: product.id,
        product_item_id: item.id,
        product_code: product.product_code,
        product_name: product.product_name,
        image_urls: product.image_urls,
        material_type_id: product.material_type_id,
        category_id: product.category_id,
        category_name: product.category_name,
        subcategory_id: product.subcategory_id,
        subcategory_name: product.subcategory_name,
        product_type: product.product_type,
        selling_price: basePriceDisplay,
        final_price: finalPriceDisplay,
        order_item_type: cartState.order_item_type,
        is_wishlisted: cartState.is_wishlisted,
        is_in_cart: cartState.is_in_cart,
        variants: variantMap[product.id] || [],
      };

      if (
        !productMap.has(product.id) ||
        productMap.get(product.id).selling_price < basePriceDisplay
      ) {
        productMap.set(product.id, productEntry);
      }
    }

    let result = Array.from(productMap.values());

    if (sort_by === "price_low_to_high") {
      result.sort((a, b) => a.selling_price - b.selling_price);
    } else if (sort_by === "price_high_to_low") {
      result.sort((a, b) => b.selling_price - a.selling_price);
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Success",
      data: result,
    });
  } catch (error) {
    console.error("Product Listing Error:", error);
    return res.status(500).json({
      statusCode: 500,
      message: "Internal Server Error",
    });
  }
};

// Get product ID by SKU with variation fallback
const getProductIdBySku = async (req, res) => {
  try {
    const { sku_id } = req.query;

    if (!sku_id || sku_id.trim() === "") {
      return commonService.badRequest(res, "sku_id is required");
    }

    const skuToSearch = sku_id.trim();

    // Step 1: Try exact match in Product table
    let product = await models.Product.findOne({
      where: { sku_id: skuToSearch },
      attributes: ["id", "sku_id", "product_name"],
      raw: true,
    });

    if (product) {
      return commonService.okResponse(res, {
        product_id: product.id,
        sku_id: product.sku_id,
        product_name: product.product_name,
        matched_type: "exact_product",
      });
    }

    // Step 2: Try exact match in ProductItemDetail table
    let itemDetail = await models.ProductItemDetail.findOne({
      where: { sku_id: skuToSearch },
      attributes: ["id", "product_id", "sku_id"],
      raw: true,
    });

    if (itemDetail) {
      const parentProduct = await models.Product.findByPk(itemDetail.product_id, {
        attributes: ["id", "sku_id", "product_name"],
        raw: true,
      });

      return commonService.okResponse(res, {
        product_id: itemDetail.product_id,
        sku_id: parentProduct?.sku_id,
        product_name: parentProduct?.product_name,
        item_detail_id: itemDetail.id,
        item_sku_id: itemDetail.sku_id,
        matched_type: "exact_item",
      });
    }

    // Step 3: Check if SKU has suffix pattern (_XX) and remove it
    const suffixPattern = /_\d+$/;

    if (suffixPattern.test(skuToSearch)) {
      const baseSku = skuToSearch.replace(suffixPattern, "");

      product = await models.Product.findOne({
        where: { sku_id: baseSku },
        attributes: ["id", "sku_id", "product_name"],
        raw: true,
      });

      if (product) {
        return commonService.okResponse(res, {
          product_id: product.id,
          sku_id: product.sku_id,
          product_name: product.product_name,
          searched_sku: skuToSearch,
          matched_type: "base_product",
        });
      }

      itemDetail = await models.ProductItemDetail.findOne({
        where: { sku_id: baseSku },
        attributes: ["id", "product_id", "sku_id"],
        raw: true,
      });

      if (itemDetail) {
        const parentProduct = await models.Product.findByPk(itemDetail.product_id, {
          attributes: ["id", "sku_id", "product_name"],
          raw: true,
        });

        return commonService.okResponse(res, {
          product_id: itemDetail.product_id,
          sku_id: parentProduct?.sku_id,
          product_name: parentProduct?.product_name,
          item_detail_id: itemDetail.id,
          item_sku_id: itemDetail.sku_id,
          searched_sku: skuToSearch,
          matched_type: "base_item",
        });
      }
    }

    return commonService.notFound(res, `No product found for SKU: ${skuToSearch}`);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Calculate final price rate for a product item
const calculateFinalPriceRate = (product, item, materialPrice) => {
  const netWeight = Number(item.net_weight || 0);
  const stoneValue = Number(item.stone_value || 0);
  const sellingPrice = Number(item.price_details?.selling_price || 0);

  let makingChargeValue = 0;
  let wastageValue = 0;
  let subtotal = 0;
  let tax = 0;
  let finalPrice = 0;

  // PIECE RATE
  if (product.product_type === "Piece Rate") {
    subtotal = sellingPrice;
    tax = (subtotal * GST_PERCENT) / 100;
    finalPrice = subtotal + tax;

    return { base_price: subtotal, tax, final_price_rate: finalPrice };
  }

  // WEIGHT BASED
  const materialValue = materialPrice * netWeight;

  // Making Charge
  if (item.making_charge_type === "Amount") {
    makingChargeValue = Number(item.making_charge || 0);
  } else if (item.making_charge_type === "Per Gram") {
    makingChargeValue = netWeight * Number(item.making_charge || 0);
  } else if (item.making_charge_type === "Percentage") {
    const gm = (netWeight * Number(item.making_charge || 0)) / 100;
    makingChargeValue = gm * materialPrice;
  }

  // Wastage
  if (item.wastage_type === "Amount") {
    wastageValue = Number(item.wastage || 0);
  } else if (item.wastage_type === "Per Gram") {
    wastageValue = netWeight * Number(item.wastage || 0);
  } else if (item.wastage_type === "Percentage") {
    const gm = (netWeight * Number(item.wastage || 0)) / 100;
    wastageValue = gm * materialPrice;
  }

  subtotal = materialValue + makingChargeValue + wastageValue + stoneValue;
  tax = (subtotal * GST_PERCENT) / 100;
  finalPrice = subtotal + tax;

  return {
    material_value: materialValue,
    making_charge: makingChargeValue,
    wastage: wastageValue,
    stone_value: stoneValue,
    subtotal,
    tax,
    final_price_rate: finalPrice,
  };
};

const getDeletedProducts = async (req, res) => {
  try {
    const {
      search,
      branch_id,
      grn_id,
      category_id,
      subcategory_id,
      material_type_id,
      ref_no_id,
      page = 1,
      limit = 10,
    } = req.query;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const offset = (parsedPage - 1) * parsedLimit;

    let bindings = [];
    let paramIndex = 1;

    const whereClauses = ["p.deleted_at IS NOT NULL"];

    if (branch_id) whereClauses.push(`p.branch_id = $${paramIndex++}`);
    if (grn_id) whereClauses.push(`p.grn_id = $${paramIndex++}`);
    if (category_id) whereClauses.push(`p.category_id = $${paramIndex++}`);
    if (subcategory_id) whereClauses.push(`p.subcategory_id = $${paramIndex++}`);
    if (material_type_id) whereClauses.push(`p.material_type_id = $${paramIndex++}`);
    if (ref_no_id) whereClauses.push(`p.ref_no_id = $${paramIndex++}`);

    if (branch_id) bindings.push(branch_id);
    if (grn_id) bindings.push(grn_id);
    if (category_id) bindings.push(category_id);
    if (subcategory_id) bindings.push(subcategory_id);
    if (material_type_id) bindings.push(material_type_id);
    if (ref_no_id) bindings.push(ref_no_id);

    if (search) {
      const searchParam = `%${search.trim()}%`;
      bindings.push(searchParam);
      const searchPlaceholder = `$${paramIndex++}`;

      const searchClause = `
        (
          p.product_name ILIKE ${searchPlaceholder} OR
          p.description ILIKE ${searchPlaceholder} OR
          CAST(p.sku_id AS TEXT) ILIKE ${searchPlaceholder} OR
          CAST(p.hsn_code AS TEXT) ILIKE ${searchPlaceholder} OR
          CAST(p.purity AS TEXT) ILIKE ${searchPlaceholder} OR
          CAST(g.grn_no AS TEXT) ILIKE ${searchPlaceholder} OR
          CAST(gi.ref_no AS TEXT) ILIKE ${searchPlaceholder} OR
          b.branch_name ILIKE ${searchPlaceholder}
        )
      `;
      whereClauses.push(searchClause);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM products p
      LEFT JOIN grns g ON p.grn_id = g.id
      LEFT JOIN "grnItems" gi ON p.ref_no_id = gi.id
      LEFT JOIN branches b ON p.branch_id = b.id
      ${whereSql}
    `;

    const dataQuery = `
      SELECT
        p.*,
        g.grn_no,
        gi.ref_no as grn_ref_no,
        b.branch_name
      FROM products p
      LEFT JOIN grns g ON p.grn_id = g.id
      LEFT JOIN "grnItems" gi ON p.ref_no_id = gi.id
      LEFT JOIN branches b ON p.branch_id = b.id
      ${whereSql}
      ORDER BY p.deleted_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    bindings.push(parsedLimit, offset);

    const [[{ total }], productsResult] = await Promise.all([
      sequelize.query(countQuery, {
        bind: bindings.slice(0, -2),
        type: sequelize.QueryTypes.SELECT,
      }),
      sequelize.query(dataQuery, {
        bind: bindings,
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    if (!productsResult.length) {
      return commonService.okResponse(res, {
        products: [],
        pagination: {
          total: 0,
          page: parsedPage,
          limit: parsedLimit,
          total_pages: 0,
        },
      });
    }

    const productIds = productsResult.map((p) => p.id);

    const deletedItemDetails = await models.ProductItemDetail.findAll({
      paranoid: false,
      where: {
        product_id: productIds,
        deleted_at: { [Op.ne]: null },
      },
      raw: true,
    });

    const itemDetailsMap = deletedItemDetails.reduce((map, item) => {
      if (!map[item.product_id]) map[item.product_id] = [];
      map[item.product_id].push(item);
      return map;
    }, {});

    const response = productsResult.map((product) => ({
      ...product,
      item_details: itemDetailsMap[product.id] || [],
    }));

    return commonService.okResponse(res, {
      products: response,
      pagination: {
        total: parseInt(total, 10),
        page: parsedPage,
        limit: parsedLimit,
        total_pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (err) {
    console.error("getDeletedProducts error:", err);
    return commonService.handleError(res, err);
  }
};

const getProductStockCounts = async (req, res) => {
  try {
    const {
      branch_id,
      material_type_id,
      category_id,
      subcategory_id,
      grn_id,
      ref_no_id,
      variant_type_ids,
      search,
    } = req.query;

    // Build common WHERE clause for all queries
    let whereClause = 'WHERE p.deleted_at IS NULL AND p.status = :status';
    const replacements = { status: "Active" };

    if (branch_id) {
      whereClause += ' AND p.branch_id = :branch_id';
      replacements.branch_id = parseInt(branch_id);
    }

    if (material_type_id) {
      whereClause += ' AND p.material_type_id = :material_type_id';
      replacements.material_type_id = parseInt(material_type_id);
    }

    if (category_id) {
      whereClause += ' AND p.category_id = :category_id';
      replacements.category_id = parseInt(category_id);
    }

    if (subcategory_id) {
      whereClause += ' AND p.subcategory_id = :subcategory_id';
      replacements.subcategory_id = parseInt(subcategory_id);
    }

    if (grn_id) {
      whereClause += ' AND p.grn_id = :grn_id';
      replacements.grn_id = parseInt(grn_id);
    }

    if (ref_no_id) {
      whereClause += ' AND p.ref_no_id = :ref_no_id';
      replacements.ref_no_id = parseInt(ref_no_id);
    }

    if (variant_type_ids) {
      const typeIds = variant_type_ids
        .split(',')
        .map((id) => parseInt(id.trim()));

      whereClause += `
        AND EXISTS (
          SELECT 1
          FROM product_variants pv
          WHERE pv.product_id = p.id
          AND pv.variant_type_ids && ARRAY[${typeIds.join(',')}]::integer[]
        )
      `;
    }

    // Add search JOINs and conditions if search is provided
    let searchJoins = '';
    if (search) {
      searchJoins = `
        LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
        LEFT JOIN branches b ON b.id = p.branch_id
        LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
        LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
      `;

      const like = `%${search}%`;
      whereClause += `
        AND (
          p.product_name ILIKE :like OR
          p.product_code ILIKE :like OR
          p.sku_id ILIKE :like OR
          p.description ILIKE :like OR
          p.hsn_code ILIKE :like OR
          p.product_type::text ILIKE :like OR
          p.variation_type::text ILIKE :like OR
          mt.material_type ILIKE :like OR
          b.branch_name ILIKE :like OR
          g.grn_no ILIKE :like OR
          gi.ref_no ILIKE :like
        )
      `;
      replacements.like = like;
    }

    // Get count of products with at least one item in stock (quantity > 0) and total quantity
    const [stockInHandResult] = await sequelize.query(
      `
      SELECT
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(pid.quantity), 0) as total_quantity
      FROM "products" p
      ${searchJoins}
      INNER JOIN "productItemDetails" pid ON p.id = pid.product_id
      ${whereClause}
      AND pid.quantity > 0
      AND pid.deleted_at IS NULL
    `,
      {
        type: sequelize.QueryTypes.SELECT,
        replacements
      }
    );

    // Get count of soft-deleted products
    const deletedWhereClause = whereClause.replace('WHERE p.deleted_at IS NULL', 'WHERE p.deleted_at IS NOT NULL');
    const [deletedResult] = await sequelize.query(
      `
      SELECT COUNT(DISTINCT p.id) as count
      FROM "products" p
      ${searchJoins}
      ${deletedWhereClause}
    `,
      {
        type: sequelize.QueryTypes.SELECT,
        replacements
      }
    );

    // Get count of products where all items are out of stock (quantity = 0)
    const [soldOutResult] = await sequelize.query(
      `
      SELECT COUNT(DISTINCT p.id) as count
      FROM "products" p
      ${searchJoins}
      ${whereClause}
      AND EXISTS (
        SELECT 1
        FROM "productItemDetails" pid_sold
        WHERE pid_sold.product_id = p.id
        AND pid_sold.quantity = 0
        AND pid_sold.stock_out_reason = 'SOLD'
        AND pid_sold.deleted_at IS NULL
      )

      -- Exclude transferred-only products
      AND NOT EXISTS (
        SELECT 1
        FROM "productItemDetails" pid_tr
        WHERE pid_tr.product_id = p.id
        AND pid_tr.quantity = 0
        AND pid_tr.stock_out_reason = 'TRANSFERRED'
        AND pid_tr.deleted_at IS NULL
      )

      -- Must be invoiced
      AND EXISTS (
        SELECT 1
        FROM sales_invoice_bill_items sii
        JOIN sales_invoice_bills sib
          ON sib.id = sii.invoice_bill_id
          AND sib.deleted_at IS NULL
          AND sib.status = 'Invoice'
          AND sib.is_active = true
        WHERE sii.deleted_at IS NULL
          AND sii.product_id = p.id
      )
    `,
      {
        type: sequelize.QueryTypes.SELECT,
        replacements
      }
    );

    return commonService.okResponse(res, {
      stockInHand: {
        productCount: parseInt(stockInHandResult?.product_count || 0),
        totalQuantity: parseInt(stockInHandResult?.total_quantity || 0),
      },
      deleted: parseInt(deletedResult?.count || 0),
      soldOut: parseInt(soldOutResult?.count || 0),
    });
  } catch (error) {
    console.error("Error in getProductStockCounts:", error);
    return commonService.handleError(res, error);
  }
};

const createProductInternal = async (payload, transaction) => {
  console.log('[createProductInternal] Starting product creation');
  console.log('[createProductInternal] Payload:', {
    product_code: payload.product_code,
    product_name: payload.product_name,
    branch_id: payload.branch_id,
    item_details_count: payload.item_details?.length || 0
  });
  
  const { item_details, ...productData } = payload;

  const product = await models.Product.create(productData, { transaction });
  console.log('[createProductInternal] Product created with ID:', product.id);

  for (const d of item_details) {
    const { additional_details = [], _source_item_id, ...fields } = d;
    console.log('[createProductInternal] Creating item detail:', {
      sku_id: fields.sku_id,
      quantity: fields.quantity,
      has_additional_details: additional_details.length > 0
    });

    const item = await models.ProductItemDetail.create(
      { ...fields, product_id: product.id },
      { transaction }
    );
    console.log('[createProductInternal] Item detail created with ID:', item.id);

    if (additional_details.length) {
      console.log(`[createProductInternal] Creating ${additional_details.length} additional details`);
      
      await models.ProductAdditionalDetail.bulkCreate(
        additional_details.map((a) => ({
          ...a,
          product_id: product.id,
          item_detail_id: item.id,
        })),
        { transaction }
      );
    }
  }

  const items = await models.ProductItemDetail.findAll({
    where: { product_id: product.id },
    transaction,
  });
  console.log(`[createProductInternal] Retrieved ${items.length} items for summary computation`);

  const summary = computeSummaries(items, product.product_type);
  console.log('[createProductInternal] Summary computed:', summary);
  
  await product.update(summary, { transaction });
  console.log('[createProductInternal] Product updated with summary');

  return product;
};

const cloneProductAddOns = async (
  sourceProductId,
  destinationProductId,
  transaction
) => {
  console.log('[cloneProductAddOns] Starting add-ons cloning');
  console.log('[cloneProductAddOns] Source product ID:', sourceProductId);
  console.log('[cloneProductAddOns] Destination product ID:', destinationProductId);
  
  const addons = await models.ProductAddOn.findAll({
    where: { product_id: sourceProductId, deleted_at: null },
    transaction,
  });
  console.log(`[cloneProductAddOns] Found ${addons.length} add-ons to clone`);

  if (!addons.length) {
    console.log('[cloneProductAddOns] No add-ons to clone, skipping');
    return;
  }

  console.log('[cloneProductAddOns] Marking destination product as add-on');
  await models.Product.update(
    { is_addOn: true },
    { where: { id: destinationProductId }, transaction }
  );

  console.log('[cloneProductAddOns] Removing existing add-ons from destination');
  await models.ProductAddOn.destroy({
    where: { product_id: destinationProductId },
    force: true,
    transaction,
  });

  console.log(`[cloneProductAddOns] Creating ${addons.length} add-ons for destination product`);
  await models.ProductAddOn.bulkCreate(
    addons.map((a) => ({
      product_id: destinationProductId,
      addon_product_id: a.addon_product_id,
    })),
    { transaction }
  );
  console.log('[cloneProductAddOns] Add-ons cloned successfully');
};

// Get top-selling subcategories based on invoice count
const getTopSellingSubcategories = async (req, res) => {
  try {
    const { branch_id, limit = 10 } = req.query;

    const replacements = { limit: parseInt(limit, 10) };
    let branchFilter = "";

    if (branch_id) {
      branchFilter = "AND sib.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT 
        s.id AS subcategory_id,
        s.subcategory_name,
        s.subcategory_image_url,
        COUNT(DISTINCT sib.id) AS total_invoices,
        COALESCE(SUM(sib.total_amount), 0) AS total_sales_amount
      FROM 
        subcategories s
      INNER JOIN 
        products p ON p.subcategory_id = s.id AND p.deleted_at IS NULL
      INNER JOIN 
        sales_invoice_bill_items sibi ON sibi.product_id = p.id AND sibi.deleted_at IS NULL
      INNER JOIN 
        sales_invoice_bills sib ON sib.id = sibi.invoice_bill_id 
        AND sib.deleted_at IS NULL AND sib.is_active = true
        AND sib.status != 'Cancelled'
        ${branchFilter}
      WHERE 
        s.deleted_at IS NULL
        AND s.status = 'Active'
      GROUP BY 
        s.id, s.subcategory_name, s.subcategory_image_url
      ORDER BY 
        total_invoices DESC, total_sales_amount DESC
      LIMIT :limit
    `;

    const topSubcategories = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const formattedData = topSubcategories.map((item, index) => ({
      rank: index + 1,
      subcategory_id: item.subcategory_id,
      subcategory_name: item.subcategory_name,
      subcategory_image_url: item.subcategory_image_url || null,
      total_invoices: parseInt(item.total_invoices, 10),
      total_sales_amount: parseFloat(item.total_sales_amount || 0).toFixed(2),
    }));

    return commonService.okResponse(res, {
      top_selling_subcategories: formattedData,
      total_results: formattedData.length,
    });
  } catch (err) {
    console.error("Error in getTopSellingSubcategories:", err);
    return commonService.handleError(res, err);
  }
};

// Get recent stock updates
const getStockUpdates = async (req, res) => {
  try {
    const { branch_id, limit = 10 } = req.query;

    const replacements = { limit: parseInt(limit, 10) };
    let branchFilter = "";

    if (branch_id) {
      branchFilter = "AND p.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }

    const query = `
      SELECT 
        p.created_at::date AS date,
        mt.material_type,
        c.category_name AS category,
        sc.subcategory_name AS sub_category,
        p.total_products AS quantity
      FROM 
        products p
      INNER JOIN 
        "materialTypes" mt ON mt.id = p.material_type_id AND mt.deleted_at IS NULL
      INNER JOIN 
        categories c ON c.id = p.category_id AND c.deleted_at IS NULL
      INNER JOIN 
        subcategories sc ON sc.id = p.subcategory_id AND sc.deleted_at IS NULL
      WHERE 
        p.deleted_at IS NULL
        AND p.status = 'Active'
        ${branchFilter}
      ORDER BY 
        p.created_at DESC
      LIMIT :limit
    `;

    const stockUpdates = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const formattedData = stockUpdates.map((item) => ({
      date: item.date,
      material_type: item.material_type,
      category: item.category,
      sub_category: item.sub_category,
      quantity: parseInt(item.quantity, 10) || 0,
    }));

    return commonService.okResponse(res, {
      stock_updates: formattedData,
      total_records: formattedData.length,
    });
  } catch (err) {
    console.error("Error in getStockUpdates:", err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createProductSKUCode,
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  generateSkuId,
  getAllProductDetails,
  getProductAddonList,
  updateProductStatus,
  searchProductBySkuNew,
  calculateSellingPrice,
  getProductsForWebsiteList,
  getProductIdBySku,
  calculateFinalPriceRate,
  getDeletedProducts,
  getProductStockCounts,
  createProductInternal,
  cloneProductAddOns,
  //newGetAllProductDetails,
  getTopSellingSubcategories,
  getStockUpdates,
  searchProductBySkuStockTransfer
};
