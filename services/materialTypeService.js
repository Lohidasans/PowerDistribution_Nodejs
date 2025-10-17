const { models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createMaterialType = async (req, res) => {
  try {
    const { material_type, material_image_url } = req.body;

    if (!material_type) {
      return commonService.badRequest(
        res,
        enMessage.failure.requiredMaterialType
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
