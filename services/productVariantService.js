const { sequelize, models } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

// Bulk create product variants by IDs
// Payload example:
// { items: [ { product_id: 10, variant_id: 1, variant_type_ids: [2,3] }, ... ] }
const createProductVariantsBulk = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    // Validate minimal fields and existence
    for (const row of items) {
      const { product_id, variant_id, variant_type_ids } = row || {};
      if (!product_id || !variant_id || !Array.isArray(variant_type_ids) || variant_type_ids.length === 0) {
        await transaction.rollback();
        return commonService.badRequest(res, enMessage.failure.requiredFields);
      }
    }

    const created = await models.ProductVariant.bulkCreate(items, {
      transaction,
      returning: true,
    });

    await transaction.commit();
    return commonService.createdResponse(res, { items: created });
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

module.exports = { createProductVariantsBulk };
