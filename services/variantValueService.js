const { models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");

const createVariantValues = async (req, res) => {
  try {
    const { variant_id, values } = req.body;

    if (!variant_id || !Array.isArray(values) || values.length === 0) {
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    const variant = await models.Variant.findByPk(variant_id);
    if (!variant) {
      return commonService.notFound(res, enMessage.failure.variantNotFound);
    }

    const variantValues = values.map(value => ({
      variant_id,
      value,
      status: "Active",
    }));

    const createdValues = await models.VariantValue.bulkCreate(variantValues);
    return commonService.createdResponse(res, { variantValues: createdValues });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createVariantValues,
};
