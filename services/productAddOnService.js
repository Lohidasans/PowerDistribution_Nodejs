const { models, sequelize } = require("../models");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

const createProductAddOn = async (req, res) => {
  try {
    const { product_id, addon_product_ids } = req.body || {};

    // Validate request
    if (!product_id || !Array.isArray(addon_product_ids) || addon_product_ids.length === 0) {
      return commonService.badRequest(res, message.failure.requiredFields);
    }

    // Prepare bulk insert data
    const addOnRecords = addon_product_ids.map((addonId) => ({
      product_id,
      addon_product_id: addonId,
    }));

    // In a transaction: mark product as is_addOn=true, then bulk create mappings
    const createdRecords = await sequelize.transaction(async (t) => {
      await models.Product.update(
        { is_addOn: true },
        { where: { id: product_id }, transaction: t }
      );

      const rows = await models.ProductAddOn.bulkCreate(addOnRecords, { transaction: t });
      return rows;
    });

    return commonService.createdResponse(res, { productAddOns: createdRecords });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = { createProductAddOn };
