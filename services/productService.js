const { models, sequelize } = require("../models");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

// Main Create Product API
const createProduct = async (req, res) => {
  try {
    const requiredFields = [
      "product_name", "description", "vendor_id", "material_type_id",
      "category_id", "subcategory_id", "grn_id", "hsn_code",
      "purity", "product_type", "variation_type"
    ];

    // Validation
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return commonService.badRequest(res, message.failure.requiredFields);
      }
    }

    const { item_details, ...productData } = req.body;

    const result = await sequelize.transaction(async (t) => {
      const sku_id = await generateSkuId(t);
      const product = await models.Product.create({ ...productData, sku_id }, { transaction: t });

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

      await models.ProductAdditionalDetail.bulkCreate(addPayload, { transaction: t });
    }
  }
};

// Helper: Generate
const generateSkuId = async (transaction) => {
  const lastProduct = await models.Product.findOne({
    order: [["id", "DESC"]],
    attributes: ["sku_id"],
    transaction,
  });

  let nextSkuNumber = 1;
  if (lastProduct?.sku_id) {
    const match = lastProduct.sku_id.match(/(\d+)$/);
    if (match) nextSkuNumber = parseInt(match[1]) + 1;
  }

  return `SKU-GN-${String(nextSkuNumber).padStart(4, "0")}`;
};


const getProductWithDetails = async (productId) => {
  const [product, items, adds] = await Promise.all([
    models.Product.findByPk(productId),
    models.ProductItemDetail.findAll({ where: { product_id: productId }, order: [["id", "ASC"]] }),
    models.ProductAdditionalDetail.findAll({ where: { product_id: productId }, order: [["id", "ASC"]] }),
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
  let totalWeight = 0, totalQty = 0, totalValue = 0;

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

// Get one by ID
const getProductById = async (req, res) => {
  try {
    const row = await commonService.findById(models.Product, req.params.id, res);
    if (!row) return;

    // fetch child details
    const [itemDetails, additionalDetails] = await Promise.all([
      models.ProductItemDetail.findAll({ where: { product_id: row.id }, order: [["id", "ASC"]] }),
      models.ProductAdditionalDetail.findAll({ where: { product_id: row.id }, order: [["id", "ASC"]] }),
    ]);

    return commonService.okResponse(res, {
      product: row,
      item_details: itemDetails,
      additional_details: additionalDetails,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteProduct = async (req, res) => {
  try {
    const row = await commonService.findById(models.Product, req.params.id, res);
    if (!row) return;
    await row.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createProduct,
  getProductById,
  deleteProduct,
};
