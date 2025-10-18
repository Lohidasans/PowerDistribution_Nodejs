const { models } = require("../models");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

// Create Product Add-On mapping: product_id -> addon_product_id
const createProductAddOn = async (req, res) => {
  try {
    const { product_id, addon_product_id } = req.body || {};

    if (!addon_product_id || !product_id) {
      return commonService.badRequest(res, message.failure.requiredFields);
    }

    const created = await models.ProductAddOn.create({ product_id, addon_product_id });
    return commonService.createdResponse(res, created);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = { createProductAddOn };
