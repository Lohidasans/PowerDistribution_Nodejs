const { models, sequelize } = require("../models/index");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");
const {
  generateUniqueCode,
  generateProductSKUCode,
} = require("../helpers/codeGeneration");

const createProductSKUCode = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    // prefix comes from query params:// e.g. "CER"
    const prefix = req.query.prefix;

    if (!prefix) {
      await t.rollback();
      return commonService.badRequest(res, "Prefix query param is required");
    }

    // Generate Product Code
    const productCode = await generateProductSKUCode(prefix);

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

    const response = {
      products,
    };

    return commonService.okResponse(res, response);
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

      // Parse JSON array string like "[1,2,3]"
      if (typeof ids === "string") {
        // Try JSON parse ONLY if it's an array like "[1,2,3]"
        if (ids.trim().startsWith("[") && ids.trim().endsWith("]")) {
          ids = JSON.parse(ids);
        } else {
          // treat as simple comma separated values
          ids = ids
            .split(",")
            .map(n => Number(n.trim()))
            .filter(Boolean);
        }
      }

      // convert single number to array
      if (typeof ids === "number") {
        ids = [ids];
      }

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
    const row = await commonService.findById(
      models.Product,
      req.params.id,
      res
    );
    if (!row) return;

    // fetch child details
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

    // Attach additional_details to their respective item_detail
    const itemsWithAdds = itemDetails.map((it) => ({
      ...it.get({ plain: true }),
      additional_details: addsByItem[it.id] || [],
    }));

    // If product has add-ons, fetch mapped add-on product info
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
        { replacements: { pid: +row.id } }
      );
      addon_products = addonRows;
    }

    // Variant details mapped to this product (from product_variants)
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
      { replacements: { pid: +row.id } }
    );

    // Get material type name
    let materialTypeName = null;
    if (row.material_type_id) {
      const material = await sequelize.query(
        `SELECT material_type FROM "materialTypes" WHERE id = :materialTypeId`,
        {
          replacements: { materialTypeId: row.material_type_id },
          type: sequelize.QueryTypes.SELECT,
          plain: true,
        }
      );
      materialTypeName = material ? material.material_type : null;
    }

    // Final structured response
    return commonService.okResponse(res, {
      product: {
        ...row.get({ plain: true }),
        material_type_name: materialTypeName,
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
    const product = await commonService.findById(
      models.Product,
      productId,
      res
    );
    if (!product) {
      await t.rollback();
      return;
    }

    // Get all item details of the product
    const itemDetails = await models.ProductItemDetail.findAll({
      where: { product_id: productId },
      transaction: t,
    });

    // Block delete if ANY quantity > 0
    // const hasStock = itemDetails.some((i) => Number(i.quantity) > 0);

    // if (hasStock) {
    //   await t.rollback();
    //   return commonService.badRequest(
    //     res,
    //     "Cannot delete product. Quantity is not zero for all item details."
    //   );
    // }

    // Delete Additional Details (soft)
    await models.ProductAdditionalDetail.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    //  Delete Item Details (soft)
    await models.ProductItemDetail.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    //  Delete Add Ons (soft)
    await models.ProductAddOn.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    // Delete Product Variants (soft)
    await models.ProductVariant.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    //  Finally delete the product (soft)
    await product.destroy({ transaction: t });

    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Get details for Web list page (with filters and search)
const getAllProductDetails = async (req, res) => {
  try {
    const {
      material_type_id,
      category_id,
      subcategory_id,
      grn_id,
      ref_no_id,
      search,
      min_price,
      max_price,
      sort_by,
      variant_type_ids
    } = req.query;

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
        g.total_amount,
        gi.ref_no,
        gi.gross_wt_in_g,
        gi.net_wt_in_g,
        gi.quantity,
        gi.type,
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
        ) as variants,
        
        -- GRN Details
        g.grn_no,
        g.grn_date,
        g.total_gross_wt_in_g,
        g.total_amount AS grn_total_amount,

        -- GRN Item Details
        gi.ref_no AS grn_ref_no,
        gi.gross_wt_in_g AS grn_gross_weight,
        gi.net_wt_in_g AS grn_net_weight,
        gi.quantity AS grn_quantity,
        gi.type AS grn_item_type,

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
        p.deleted_at,
        COALESCE(SUM(COALESCE(pid.quantity, 0)), 0) AS total_quantity,
        COALESCE(SUM(COALESCE(pid.quantity, 0) * COALESCE(pid.net_weight, 0)), 0) AS total_weight,
        COUNT(DISTINCT pid.id) AS variation_count,
        mt.material_type,
        mt.material_price
      FROM products p
      LEFT JOIN "productItemDetails" pid ON pid.product_id = p.id
      -- GRN Joins
      LEFT JOIN grns g ON g.id = p.grn_id AND g.deleted_at IS NULL
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.id = p.ref_no_id AND gi.deleted_at IS NULL
      LEFT JOIN "materialTypes" mt ON mt.id = p.material_type_id
      LEFT JOIN categories ct ON ct.id = p.category_id
      LEFT JOIN subcategories sc ON sc.id = p.subcategory_id
      WHERE 1=1 AND p.status = 'Active' AND p.deleted_at IS NULL`;

    const replacements = {};

    if (material_type_id) {
      query += ` AND p.material_type_id = :material_type_id`;
      replacements.material_type_id = +material_type_id;
    }
    if (category_id) {
      query += ` AND p.category_id = :category_id`;
      replacements.category_id = +category_id;
    }
    if (subcategory_id) {
      query += ` AND p.subcategory_id = :subcategory_id`;
      replacements.subcategory_id = +subcategory_id;
    }
    if (grn_id) {
      query += ` AND p.grn_id = :grn_id`;
      replacements.grn_id = +grn_id;
    }
    if (ref_no_id) {
      query += ` AND p.ref_no_id = :ref_no_id`;
      replacements.ref_no_id = +ref_no_id;
    }

    if (variant_type_ids) {
      // Convert comma-separated string to array of numbers
      const typeIds = variant_type_ids.split(',').map(id => parseInt(id.trim()));

      // Use array overlap operator (&&) to find any match
      query += ` AND EXISTS (
        SELECT 1 
        FROM product_variants pv
        WHERE pv.product_id = p.id
        AND pv.variant_type_ids && ARRAY[${typeIds.join(',')}]::integer[]
      )`;
    }

    if (search) {
      const like = `%${search}%`;
      query += ` AND (
        p.product_name ILIKE :like OR
        p.product_code ILIKE :like OR
        p.sku_id ILIKE :like OR
        p.description ILIKE :like OR
        p.hsn_code ILIKE :like OR
        p.product_type::text ILIKE :like OR
        p.variation_type::text ILIKE :like OR
        mt.material_type ILIKE :like OR
        g.grn_no ILIKE :like OR
        gi.ref_no ILIKE :like 
      )`;
      replacements.like = like;
    }

    query += `
      GROUP BY p.id, mt.material_type, mt.material_price, ct.category_name, ct.category_image_url, sc.subcategory_name,
      g.grn_no, g.grn_date, g.total_gross_wt_in_g, g.total_amount, gi.ref_no, gi.gross_wt_in_g, gi.net_wt_in_g,
      gi.quantity, gi.type
      ORDER BY p.id DESC`;

    const [rows] = await sequelize.query(query, { replacements });

    // Process variants and format the response
    let products = rows.map(row => ({
      ...row,
      variants: row.variants || []
    }));

    if (products.length) {
      const productIds = products.map((p) => p.id);
      const itemDetails = await models.ProductItemDetail.findAll({
        where: { product_id: productIds },
        order: [["id", "ASC"]],
      });

      const itemIds = itemDetails.map((it) => it.id);
      const additionalDetails = itemIds.length
        ? await models.ProductAdditionalDetail.findAll({
          where: { item_detail_id: itemIds },
        })
        : [];

      // Group additional by item_detail_id
      const addsByItem = additionalDetails.reduce((acc, add) => {
        const key = String(add.item_detail_id);
        (acc[key] = acc[key] || []).push(add);
        return acc;
      }, {});

      // Calculate selling price for each item and attach additional details
      const itemsWithPrices = await Promise.all(
        products.flatMap(async (product) => {
          const productItems = itemDetails.filter(
            (item) => item.product_id === product.id
          );

          const itemsWithAdds = await Promise.all(
            productItems.map(async (item) => {
              const itemData = item.get({ plain: true });
              const priceDetails = await calculateSellingPrice(
                {
                  ...product,
                  material_type_id: product.material_type_id,
                  product_type: product.product_type,
                },
                itemData,
                models
              );

              return {
                ...itemData,
                additional_details: addsByItem[String(item.id)] || [],
                price_details: priceDetails,
              };
            })
          );

          // Group items by product_id
          const itemsByProduct = itemsWithAdds.reduce((acc, it) => {
            const key = String(it.product_id);
            (acc[key] = acc[key] || []).push(it);
            return acc;
          }, {});

          return {
            ...product,
            itemDetails: itemsByProduct[String(product.id)] || [],
          };
        })
      );

      products = itemsWithPrices;
    }

    // Apply sorting if sort_by parameter is provided
    if (sort_by) {
      switch (sort_by) {
        case 'price_low_to_high':
          products.sort((a, b) => {
            const minPriceA = Math.min(...a.itemDetails.map(item => item.price_details?.selling_price || Infinity));
            const minPriceB = Math.min(...b.itemDetails.map(item => item.price_details?.selling_price || Infinity));
            return minPriceA - minPriceB;
          });
          break;
          
        case 'price_high_to_low':
          products.sort((a, b) => {
            const maxPriceA = Math.max(...a.itemDetails.map(item => item.price_details?.selling_price || 0));
            const maxPriceB = Math.max(...b.itemDetails.map(item => item.price_details?.selling_price || 0));
            return maxPriceB - maxPriceA;
          });
          break;
          
        case 'last_updated':
          products.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
          break;
          
        default:
          // No sorting or invalid sort_by value
          break;
      }
    }

    // Apply price range filtering only if both min_price and max_price are provided
    if (min_price && max_price) {
      const min = parseFloat(min_price);
      const max = parseFloat(max_price);

      // Validate that both min and max are valid numbers
      if (isNaN(min) || isNaN(max)) {
        return commonService.badRequest(res, 'Both min_price and max_price must be valid numbers');
      }

      if (min > max) {
        return commonService.badRequest(res, 'min_price must be less than or equal to max_price');
      }

      // Filter itemDetails within each product instead of filtering products
      products = products.map(product => {
        // Create a new product object with filtered itemDetails
        const filteredItemDetails = (product.itemDetails || []).filter(item => {
          const sellingPrice = item.price_details?.selling_price;
          if (sellingPrice === undefined || sellingPrice === null) return false;
          return sellingPrice >= min && sellingPrice <= max;
        });
        
        // Only include the product if it has any itemDetails after filtering
        if (filteredItemDetails.length > 0) {
          return {
            ...product,
            itemDetails: filteredItemDetails
          };
        }
        return null;
      }).filter(Boolean); // Remove any null entries (products with no matching items)
    }

    return commonService.okResponse(res, { products });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Search products by SKU (main or item details)
const searchProductBySku = async (req, res) => {
  try {
    const { sku } = req.query;

    if (!sku) {
      return commonService.badRequest(res, "SKU is required for search");
    }

    const directProduct = await models.Product.findOne({
      where: { sku_id: sku },
      raw: true,
    });

    const itemDetail = await models.ProductItemDetail.findOne({
      where: { sku_id: sku },
      raw: true,
    });

    // If found in ProductItemDetail, fetch its parent product
    let parentProduct = null;
    if (itemDetail) {
      parentProduct = await models.Product.findOne({
        where: { id: itemDetail.product_id },
        raw: true,
      });
    }

    // Determine final product and itemDetails to return
    let finalProduct = null;
    let finalItemDetails = [];

    if (directProduct) {
      // SKU matched product directly (not variation)
      finalProduct = directProduct;

      // Fetch all its items (optional: or none if you only want product)
      const items = await models.ProductItemDetail.findAll({
        where: { product_id: directProduct.id },
        raw: true,
      });
      finalItemDetails = items;
    } else if (parentProduct && itemDetail) {
      // SKU matched one of the product itemDetails
      finalProduct = parentProduct;
      finalItemDetails = [itemDetail]; // only the matched one
    }

    if (!finalProduct) {
      return commonService.notFound(res, "No product found for given SKU");
    }

    const result = {
      ...finalProduct,
      itemDetails: finalItemDetails,
    };

    return commonService.okResponse(res, [result]);
  } catch (error) {
    console.error("Error searching products by SKU:", error);
    return commonService.handleError(res, error);
  }
};

const searchProductBySkuNew = async (req, res) => {
  try {
    const { sku } = req.query;

    // Helper: convert product + item → flat response object
    const formatItem = async (product, item) => {
      let name = product.product_name;

      // Add await here
      const priceDetails = await calculateSellingPrice(product, item, models);

      return {
        sku_id: item.sku_id || product.sku_id,  // Use item.sku_id if available
        product_name: name,
        product_variations: product.product_variations,
        purity: product.purity,
        branch_id: product.branch_id,
        product_id: product.id,
        product_item_details_id: item.id,
        hsn_code: product.hsn_code,
        base_price: item.base_price,
        gross_weight: item.gross_weight,
        net_weight: item.net_weight,
        product_item_wastage: item.wastage,
        ...priceDetails
      };
    };

    // CASE 1 → No SKU supplied
    if (!sku || sku.trim() === "") {
      const [allProducts, allItems] = await Promise.all([
        models.Product.findAll({ raw: true }),
        models.ProductItemDetail.findAll({ raw: true })
      ]);

      // Process items in parallel
      const output = await Promise.all(
        allItems.map(async (item) => {
          const product = allProducts.find(p => p.id === item.product_id);
          return product ? formatItem(product, item) : null;
        })
      );

      // Filter out any null items (in case product wasn't found)
      return commonService.okResponse(res, output.filter(Boolean));
    }

    // CASE 2 → SKU provided
    const [directProduct, itemDetail] = await Promise.all([
      models.Product.findOne({ where: { sku_id: sku }, raw: true }),
      models.ProductItemDetail.findOne({ where: { sku_id: sku }, raw: true })
    ]);

    let product = directProduct;
    let items = [];

    if (directProduct) {
      // If product SKU matched, return all its item variations
      items = await models.ProductItemDetail.findAll({
        where: { product_id: directProduct.id },
        raw: true,
      });
    } else if (itemDetail) {
      // If item SKU matched, fetch its parent product
      product = await models.Product.findOne({
        where: { id: itemDetail.product_id },
        raw: true,
      });
      items = [itemDetail];
    }

    if (!product) {
      return commonService.notFound(res, "No product found for given SKU");
    }

    // Convert to flat response with price calculations
    const flatResponse = await Promise.all(
      items.map(item => formatItem(product, item))
    );

    return commonService.okResponse(res, flatResponse);

  } catch (error) {
    console.error("Error searching products by SKU:", error);
    return commonService.handleError(res, error);
  }
};

const calculateSellingPrice = async (product, item, models) => {
  try {
    // 1. Get Material Rate Per Gram
    let materialRate;
    const material = await models.MaterialType.findByPk(product.material_type_id, { raw: true });
    const materialPrice = parseFloat(material?.material_price) || 0;
    
    if (product.product_type === "Piece Rate") {
      const ratePerGram = parseFloat(item.rate_per_gram) || 0;
      // For Piece Rate, take the higher value between rate_per_gram and material_price
      materialRate = Math.max(ratePerGram, materialPrice);
    } else { // Weight based
      materialRate = materialPrice;
    }


    // 2. Material Contribution
    const netWeight = parseFloat(item.net_weight) || 0;
    const materialContribution = materialRate * netWeight;

    // 3. Stone Value
    const stoneValue = parseFloat(item.stone_value) || 0;

    // 4. Additional Details Sum
    const additionalDetails = await models.ProductAdditionalDetail.findAll({
      where: { item_detail_id: item.id },
      raw: true
    });

    const additionalDetailsSum = additionalDetails.reduce((sum, detail) => {
      return sum + (parseFloat(detail.value) || 0);
    }, 0);

    // 5. Making Charge Calculation
    let makingCharge = 0;
    const makingChargeValue = parseFloat(item.making_charge) || 0;
    switch (item.making_charge_type) {
      case 'Per Gram':
        makingCharge = makingChargeValue * netWeight;
        break;
      case 'Percentage':
        makingCharge = (makingChargeValue / 100) * materialContribution;
        break;
      case 'Amount':
        makingCharge = makingChargeValue;
        break;
    }

    // 6. Wastage Calculation
    let wastage = 0;
    const wastageValue = parseFloat(item.wastage) || 0;
    switch (item.wastage_type) {
      case 'Per Gram':
        wastage = wastageValue * netWeight;
        break;
      case 'Percentage':
        wastage = (wastageValue / 100) * materialContribution;
        break;
      case 'Amount':
        wastage = wastageValue;
        break;
    }

    // 7. Final Selling Price
    const sellingPrice = materialContribution + makingCharge + wastage + stoneValue + additionalDetailsSum;

    return {
      material_rate_per_gram: materialRate,
      material_contribution: materialContribution,
      making_charge: makingCharge,
      wastage: wastage,
      stone_value: stoneValue,
      additional_details_value: additionalDetailsSum,
      selling_price: sellingPrice
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
      error: "Error calculating price"
    };
  }
};

// Update Product Status API
const updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (status === undefined) {
      return commonService.badRequest(res, "Status is required");
    }

    const productData = await models.Product.findByPk(id);

    if (!productData) {
      return commonService.notFound(res, "Product not found");
    }

    // Update product status
    await models.Product.update({ status }, { where: { id } });

    return commonService.okResponse(res, {
      message: "Product status updated successfully",
    });
  } catch (err) {
    console.error("Error updating product status:", err);
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
  searchProductBySku,
  updateProductStatus,
  searchProductBySkuNew,
  calculateSellingPrice,
};
