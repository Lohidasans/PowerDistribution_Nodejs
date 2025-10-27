const { models } = require("../models");
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

    // Perform bulk create
    const createdRecords = await models.ProductAddOn.bulkCreate(addOnRecords);

    return commonService.createdResponse(res, { productAddOns: createdRecords });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = { createProductAddOn };
