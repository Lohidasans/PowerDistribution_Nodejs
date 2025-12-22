const { models, sequelize } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createMaterialType = async (req, res) => {
  try {
    const { 
      material_type, 
      material_image_url, 
      material_price,
      purity_name,
      purity_percentage,
      website_visibility
    } = req.body;

    // Only material_type is required
    if (!material_type) {
      return commonService.badRequest(res, enMessage.materialType.required);
    }

    // Check if material type already exists (only among non-deleted records)
    const existingMaterialType = await models.MaterialType.findOne({
      where: {
        material_type: material_type,
        deleted_at: null,
      },
      paranoid: false,
    });

    if (existingMaterialType) {
      return commonService.badRequest(
        res,
        enMessage.materialType.alreadyExists
      );
    }

    // Create with only the provided fields
    const materialData = {
      material_type,
      ...(material_price !== undefined && { material_price }),
      ...(material_image_url !== undefined && { material_image_url }),
      ...(purity_name !== undefined && { purity_name }),
      ...(purity_percentage !== undefined && { purity_percentage }),
      ...(website_visibility !== undefined && { website_visibility })
    };

    const row = await models.MaterialType.create(materialData);
    return commonService.createdResponse(res, { materialType: row });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(res, enMessage.materialType.duplication);
    }
    return commonService.handleError(res, err);
  }
};

// Update the listMaterialTypes function to include new fields in the response
const listMaterialTypes = async (req, res) => {
  try {
    const { search = "", material_type } = req.query;
    const where = {};
    const searchCondition = buildSearchCondition(search, [
      "material_type",
      "purity_name" // Add new searchable field
    ]);
    if (searchCondition) Object.assign(where, searchCondition);

    if (material_type && typeof material_type === "string" && material_type.trim()) {
      where.material_type = { [Op.iLike]: `%${material_type.trim()}%` };
    }

    const items = await models.MaterialType.findAll({
      where,
      order: [["created_at", "DESC"]],
    });
    return commonService.okResponse(res, { materialTypes: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update the listMaterialTypesDropdown to include new fields if needed
const listMaterialTypesDropdown = async (req, res) => {
  try {
    const items = await models.MaterialType.findAll({
      attributes: [
        "id", 
        "material_type", 
        "material_price",
        "purity_name",
        "purity_percentage",
        "website_visibility"
      ],
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

// Update the updateMaterialType function
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
          id: { [Op.ne]: req.params.id },
          deleted_at: null,
        },
        paranoid: false,
      });

      if (existingMaterialType) {
        return commonService.badRequest(
          res,
          enMessage.materialType.alreadyExists
        );
      }
    }

    // Only update fields that are provided in the request
    const updateData = { ...req.body };
    
    // Remove undefined or null values to avoid overwriting with null
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined || updateData[key] === null) {
        delete updateData[key];
      }
    });

    await entity.update(updateData);
    return commonService.okResponse(res, { materialType: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


const updateMaterialTypesBulk = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { materials } = req.body;

    if (!Array.isArray(materials) || materials.length === 0) {
      await transaction.rollback();
      return commonService.badRequest(res, "materials array is required");
    }

    const updatedMaterials = [];

    for (const item of materials) {
      const { id, material_type } = item;

      if (!id) {
        await transaction.rollback();
        return commonService.badRequest(res, "Each material must have an id");
      }

      // Fetch material
      const entity = await models.MaterialType.findByPk(id, {
        transaction,
        paranoid: false,
      });

      if (!entity || entity.deleted_at) {
        await transaction.rollback();
        return commonService.notFound(
          res,
          `MaterialType not found for id ${id}`
        );
      }

      // Duplicate material_type check
      if (material_type && material_type !== entity.material_type) {
        const existingMaterialType = await models.MaterialType.findOne({
          where: {
            material_type,
            id: { [Op.ne]: id },
            deleted_at: null,
          },
          paranoid: false,
          transaction,
        });

        if (existingMaterialType) {
          await transaction.rollback();
          return commonService.badRequest(
            res,
            `Material type '${material_type}' already exists`
          );
        }
      }

      //  Remove null / undefined fields
      const updateData = { ...item };
      delete updateData.id;

      Object.keys(updateData).forEach((key) => {
        if (updateData[key] === undefined || updateData[key] === null) {
          delete updateData[key];
        }
      });

      //  Update
      await entity.update(updateData, { transaction });

      updatedMaterials.push(entity);
    }

    await transaction.commit();

    return commonService.okResponse(res, {
      message: "Materials updated successfully",
      materials: updatedMaterials,
    });

  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
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
  updateMaterialTypesBulk
};
