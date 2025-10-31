const { sequelize, models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const db = require("../config/dbConfig");

const createVariant = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { variant_type, values } = req.body;

    if (!variant_type) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        enMessage.failure.requiredVariantType
      );
    }

    // Create variant
    const variant = await models.Variant.create(
      { variant_type },
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

// List variants with values as array items and optional variant_type filter
const listVariantsDetailed = async (req, res) => {
  try {
    const { variant_type } = req.query;

    const whereClause = `
      WHERE v.deleted_at IS NULL
      ${variant_type ? 'AND v.variant_type = :vt' : ''}
    `;

    const sql = `
      SELECT
        v.id AS id,
        v.variant_type AS "Variant Type",
        COALESCE(
          json_agg(
            json_build_object('id', vv.id, 'value', vv.value)
            ORDER BY vv.id
          ) FILTER (WHERE vv.id IS NOT NULL),
          '[]'::json
        ) AS "Values"
      FROM variants v
      LEFT JOIN "variantValues" vv
        ON vv.variant_id = v.id AND vv.deleted_at IS NULL
      ${whereClause}
      GROUP BY v.id, v.variant_type
      ORDER BY v.id ASC`;

    const replacements = {};
    //if (variant_type) replacements.vt = `%${variant_type}%`;
    if (variant_type) replacements.vt = variant_type.trim();
    const [rows] = await sequelize.query(sql, { replacements });
    return commonService.okResponse(res, { variants: rows });
  } catch (err) {
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

const getByIdVariant = async (req, res) => {
  try {
    const { id } = req.params;

    const variant = await models.Variant.findByPk(id);
    if (!variant) {
      return commonService.notFound(res, enMessage.failure.variantNotFound);
    }

    // Fetch values separately (no association)
    const variant_values = await models.VariantValue.findAll({
      where: { variant_id: id, status: "Active" },
      attributes: ["id", "value", "sort_order", "status"],
      order: [["id", "ASC"]],
    });

    return commonService.okResponse(res, { variant, variant_values });
  } catch (err) {
    return commonService.handleError(res, err);
  }
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
    const search = (req.query.search || "").trim();

    // Build SQL with LEFT JOIN (keep variants without values) and optional search
    const sql = `
      SELECT
        v.id AS "id",
        v.variant_type,
        COALESCE(STRING_AGG(vv.value, ', ' ORDER BY vv.id), '') AS "Values"
      FROM
        variants v
      LEFT JOIN
        "variantValues" vv
          ON vv.variant_id = v.id
         AND vv.deleted_at IS NULL
      WHERE
        v.deleted_at IS NULL
        ${search ? `AND (
            v.variant_type ILIKE :search
            OR EXISTS (
              SELECT 1 FROM "variantValues" vv2
               WHERE vv2.variant_id = v.id AND vv2.deleted_at IS NULL AND vv2.value ILIKE :search
            )
        )` : ''}
      GROUP BY v.id, v.variant_type
      ORDER BY v.id ASC`;

    const replacements = search ? { search: `%${search}%` } : {};
    const [rows] = await sequelize.query(sql, { replacements });
    return commonService.okResponse(res, { variants: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateVariant = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { variant_type, values, status } = req.body;

    // Check if variant exists
    const variant = await models.Variant.findByPk(id);
    if (!variant) {
      await transaction.rollback();
      return commonService.notFound(res, enMessage.variant.notFound);
    }

    // Prepare update data
    const updateData = {};
    if (variant_type !== undefined) updateData.variant_type = variant_type;
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

    // Fetch updated variant and values separately (no association)
    const updatedVariant = await models.Variant.findByPk(id);
    const variant_values = await models.VariantValue.findAll({
      where: { variant_id: id },
      attributes: ["id", "value", "sort_order", "status"],
      order: [["id", "ASC"]],
    });

    return commonService.okResponse(res, {
      variant: updatedVariant,
      variant_values,
    });
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createVariant,
  getByIdVariant,
  updateVariant,
  deleteVariant,
  listVariantWithValues,
  listVariantsDetailed,
};
