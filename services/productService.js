const { models, sequelize } = require("../models");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

// Main Create Product API
const createProduct = async (req, res) => {
  try {
    const requiredFields = ["product_name", "description", "vendor_id", "material_type_id",
      "category_id", "subcategory_id", "grn_id", "hsn_code", "purity", "product_type", "variation_type" ];

    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === "")
        return commonService.badRequest(res, message.failure.requiredFields);
    }

    const { item_details, additional_details, ...productData } = req.body;
    
    const result = await sequelize.transaction(async (t) => {
      // Step 1: Find last product SKU
      const lastProduct = await models.Product.findOne({ order: [["id", "DESC"]], attributes: ["sku_id"], transaction: t, });
      
      // Step 2: Extract numeric part and increment
      let nextSkuNumber = 1; // start from 0001
      if (lastProduct && lastProduct.sku_id) {
        const match = lastProduct.sku_id.match(/(\d+)$/);
        if (match) nextSkuNumber = parseInt(match[1]) + 1;
      }

      // Step 3: Generate new SKU with padded zeros (e.g. SKU-GN-0001)
      const newSku = `SKU-GN-${String(nextSkuNumber).padStart(4, "0")}`;
      productData.sku_id = newSku;

      // Step 4: Create Product
      const product = await models.Product.create(productData, { transaction: t });

      // Step 5: Create product item details and additional details
      await createItemDetails(product.id, item_details, additional_details, t);

      // Step 6: Compute summary
      const items = await models.ProductItemDetail.findAll({
        where: { product_id: product.id },
        transaction: t,
      });

      const summary = computeSummaries(items, product.product_type);
      await product.update(summary, { transaction: t });

      return product;
    });

    return commonService.createdResponse(res, { product: result });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


// Helper: Create Item Details & Additional Details
const createItemDetails = async (productId, itemDetails, additionalDetails, t) => {
  let firstItem;

  for (const d of itemDetails || []) {
    const { additional_details: adds = [], ...fields } = d;
    const item = await models.ProductItemDetail.create({ ...fields, product_id: productId }, { transaction: t });

    // Insert nested additional details
    if (adds?.length) {
      const addPayload = adds.map((a) => ({
        ...a,
        item_detail_id: item.id,
        product_id: productId,
      }));
      await models.ProductAdditionalDetail.bulkCreate(addPayload, { transaction: t });
    }

    if (!firstItem) firstItem = item;
  }

  // Top-level additional_details
  if (additionalDetails?.length) {
    if (!firstItem) {
      firstItem = await models.ProductItemDetail.create({ product_id: productId }, { transaction: t });
    }

    const addPayload = additionalDetails.map((a) => ({
      ...a,
      item_detail_id: firstItem.id,
      product_id: productId,
    }));

    await models.ProductAdditionalDetail.bulkCreate(addPayload, { transaction: t });
  }
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

// Wrappers for product type variations
const wrapper = (type, variation) => (req, res) => {
  req.body.product_type = type;
  req.body.variation_type = variation;
  return createProduct(req, res);
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
  createWeightWithoutVariation: wrapper("Weight Based", "Without Variations"),
  createWeightWithVariation: wrapper("Weight Based", "With Variations"),
  createPieceWithoutVariation: wrapper("Piece Rate", "Without Variations"),
  createPieceWithVariation: wrapper("Piece Rate", "With Variations"),
  getProductById,
  deleteProduct,
};
