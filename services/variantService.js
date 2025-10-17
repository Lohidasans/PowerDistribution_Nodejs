const { sequelize, models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const db = require("../config/dbConfig");

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
      createdValues = await createVariantValues(
        variant.id,
        values,
        transaction
      );
    }

    await transaction.commit();
    // Ensure we return the persisted values (with IDs)
    if (!createdValues.length) {
      createdValues = await models.VariantValue.findAll({
        where: { variant_id: variant.id },
        order: [["id", "ASC"]],
      });
    }
    return commonService.createdResponse(res, {
      variant,
      variant_values: createdValues,
    });
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

  const created = await models.VariantValue.bulkCreate(payload, {
    transaction,
    returning: true,
  });
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

const listVariantWithValues = async (req, res) => {
  try {
    const [rows] = await sequelize.query(`SELECT
            v.id AS "id",
            v.variant_type,
            STRING_AGG(vv.value, ', ' ORDER BY vv.id) AS "Values"
          FROM
            variants v
          LEFT JOIN
            "variantValues" vv ON vv.variant_id = v.id
          WHERE
            v.deleted_at IS NULL AND vv.deleted_at IS NULL
          GROUP BY
            v.id, v.variant_type
          ORDER BY
            v.id ASC`);
    return commonService.okResponse(res, { variants: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateVariant = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { variant_type, product_id, values, status } = req.body;

    // Check if variant exists
    const variant = await models.Variant.findByPk(id);
    if (!variant) {
      await transaction.rollback();
      return commonService.notFound(res, enMessage.variant.notFound);
    }

    // Prepare update data
    const updateData = {};
    if (variant_type !== undefined) updateData.variant_type = variant_type;
    if (product_id !== undefined) updateData.product_id = product_id;
    if (status !== undefined) updateData.status = status;

    // Update variant if there are fields to update
    if (Object.keys(updateData).length > 0) {
      await variant.update(updateData, { transaction });
    }

    // Handle variant values update if provided
    if (Array.isArray(values)) {
      // Delete existing variant values
      await models.VariantValue.destroy({
        where: { variant_id: id },
        transaction,
        force: true, // Force delete to bypass soft delete
      });

      // Create new variant values
      if (values.length > 0) {
        await createVariantValues(id, values, transaction);
      }
    }

    await transaction.commit();

    // Fetch updated variant with values
    const updatedVariant = await models.Variant.findByPk(id, {
      include: [
        {
          model: models.VariantValue,
          as: "variant_values",
          attributes: ["id", "value", "sort_order", "status"],
        },
      ],
    });

    return commonService.okResponse(res, {
      variant: updatedVariant,
    });
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createVariant,
  updateVariant,
  deleteVariant,
  listVariantWithValues,
};
