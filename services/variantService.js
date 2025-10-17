const { sequelize, models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");

const createVariant = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { variant_type, product_id, values } = req.body;

    if (!variant_type || !product_id) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        enMessage.failure.requiredVariantType
      );
    }

    // Create variant
    const variant = await models.Variant.create(
      { variant_type, product_id },
      { transaction }
    );

    // Create variant values if provided
    if (Array.isArray(values) && values.length > 0) {
      await createVariantValues(variant.id, values, transaction);
    }

    await transaction.commit();
    return commonService.createdResponse(res, { variant });
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const createVariantValues = async (variantId, values, transaction) => {
  const variantValues = values.map((value) => ({
    variant_id: variantId,
    value,
    status: "Active",
  }));

  await models.VariantValue.bulkCreate(variantValues, { transaction });
};


const deleteVariant = async (req, res) => {
  try {
    const { id } = req.params;

    const variant = await models.Variant.findByPk(id);
    if (!variant) {
      return commonService.notFound(res, enMessage.failure.variantNotFound);
    }

    await variant.destroy();

    return commonService.noContent(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createVariant,
  deleteVariant,
};
