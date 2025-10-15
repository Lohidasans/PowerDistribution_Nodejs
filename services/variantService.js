const { models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");

const createVariant = async (req, res) => {
  try {
    const { variant_type, product_id} = req.body;

    if (!variant_type) {
      return commonService.badRequest(res, enMessage.failure.requiredVariantType);
    }

    const variant = await models.Variant.create({
      variant_type,
      product_id,
    });

    return commonService.createdResponse(res, { variant });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createVariant,
};
