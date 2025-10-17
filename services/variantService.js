const { sequelize, models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");

const createVariant = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { variant_type, product_id, values } = req.body;

    if (!variant_type) {
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
    let createdValues = [];
    if (Array.isArray(values) && values.length > 0) {
      createdValues = await createVariantValues(variant.id, values, transaction);
    }

    await transaction.commit();
    // Ensure we return the persisted values (with IDs)
    if (!createdValues.length) {
      createdValues = await models.VariantValue.findAll({ where: { variant_id: variant.id }, order: [["id", "ASC"]] });
    }
    return commonService.createdResponse(res, { variant, variant_values: createdValues });
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const createVariantValues = async (variantId, values, transaction) => {
  const payload = values.map((value) => ({
    variant_id: variantId,
    value,
    status: "Active",
  }));

  const created = await models.VariantValue.bulkCreate(payload, { transaction, returning: true });
  return created;
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
