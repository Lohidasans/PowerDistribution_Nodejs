const { models, sequelize } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createMaterialType = async (req, res) => {
  try {
    const { material_type, material_image_url } = req.body;

    if (!material_type) {
      return commonService.badRequest(res, enMessage.materialType.required);
    }

    // Check if material type already exists (only among non-deleted records)
    const existingMaterialType = await models.MaterialType.findOne({
      where: {
        material_type: material_type,
        deleted_at: null, // Only check non-deleted records
      },
      paranoid: false, // Include soft-deleted records in search but filter them out with deleted_at: null
    });

    if (existingMaterialType) {
      return commonService.badRequest(
        res,
        enMessage.materialType.alreadyExists
      );
    }

    const row = await models.MaterialType.create({
      material_type,
      material_image_url,
    });

    return commonService.createdResponse(res, { materialType: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listMaterialTypes = async (req, res) => {
  try {
    const { search = "" } = req.query;
    const where = {};
    const searchCondition = buildSearchCondition(search, ["material_type"]);
    if (searchCondition) Object.assign(where, searchCondition);

    const items = await models.MaterialType.findAll({
      where,
      order: [["created_at", "DESC"]],
    });
    return commonService.okResponse(res, { materialTypes: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listMaterialTypesDropdown = async (req, res) => {
  try {
    const items = await models.MaterialType.findAll({
      attributes: ["id", "material_type"],
      order: [["material_type", "ASC"]],
    });
    return commonService.okResponse(res, { materialTypes: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getMaterialTypeById = async (req, res) => {
  const entity = await commonService.findById(
    models.MaterialType,
    req.params.id,
    res
  );
  if (!entity) return;
  return commonService.okResponse(res, { materialType: entity });
};

const updateMaterialType = async (req, res) => {
  const entity = await commonService.findById(
    models.MaterialType,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    const { material_type } = req.body;

    // Check if material_type is being updated and if it already exists in another record
    if (material_type && material_type !== entity.material_type) {
      const existingMaterialType = await models.MaterialType.findOne({
        where: {
          material_type: material_type,
          id: { [Op.ne]: req.params.id }, // Exclude current record
          deleted_at: null, // Only check non-deleted records
        },
        paranoid: false, // Include soft-deleted records in search but filter them out with deleted_at: null
      });

      if (existingMaterialType) {
        return commonService.badRequest(
          res,
          enMessage.materialType.alreadyExists
        );
      }
    }

    await entity.update(req.body);
    return commonService.okResponse(res, { materialType: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteMaterialType = async (req, res) => {
  const entity = await commonService.findById(
    models.MaterialType,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createMaterialType,
  listMaterialTypes,
  listMaterialTypesDropdown,
  getMaterialTypeById,
  updateMaterialType,
  deleteMaterialType,
};
