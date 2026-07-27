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
      website_visibility,
      branch_id
    } = req.body;

    // Only material_type is required
    if (!material_type) {
      return commonService.badRequest(res, enMessage.materialType.required);
    }

    // Check if this exact material type + purity combination already exists
    // (only among non-deleted records). Different purities of the same
    // material_type (e.g. Gold 22K vs Gold 24K) are allowed to coexist.
    const existingMaterialType = await models.MaterialType.findOne({
      where: {
        material_type: material_type,
        purity_percentage: purity_percentage ?? null,
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
      branch_id: branch_id || 1, // default to 1 if not provided
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
    const { search = "", material_type, branch_id } = req.query;
    const where = {};
    const searchCondition = buildSearchCondition(search, [
      "material_type",
      "purity_name" // Add new searchable field
    ]);
    if (searchCondition) Object.assign(where, searchCondition);

    if (material_type && typeof material_type === "string" && material_type.trim()) {
      where.material_type = { [Op.iLike]: `%${material_type.trim()}%` };
    }

    if (branch_id) {
      where.branch_id = branch_id;
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
    const { branch_id, vendor_id } = req.query;

    const where = {
      deleted_at: null
    };

    // Branch filter
    if (branch_id) {
      where.branch_id = branch_id;
    }

    // Vendor filter
    if (vendor_id) {
      const vendor = await models.Vendor.findOne({
        where: {
          id: vendor_id,
          deleted_at: null
        },
        attributes: ["id", "material_type_ids"]
      });

      if (!vendor) {
        return commonService.badRequest(res, {
          message: "Vendor not found"
        });
      }

      const selectedIds = vendor.material_type_ids || [];

      // If vendor has no mapped materials
      if (selectedIds.length === 0) {
        return commonService.okResponse(res, {
          materialTypes: []
        });
      }

      where.id = {
        [Op.in]: selectedIds
      };
    }

   const items = await models.MaterialType.findAll({
    where,
    attributes: [
      "id",
      "material_type",
      "material_price",
      "purity_name",
      "purity_percentage",
      "website_visibility",
      "branch_id"
    ],
    order: [["material_type", "ASC"],
      ["id", "ASC"] // keeps the first created record
    ]
  });

  // Remove duplicate material types
  const uniqueMaterialTypes = [];
  const seen = new Set();

  for (const item of items) {
    const key = item.material_type?.trim().toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      uniqueMaterialTypes.push(item);
    }
  }

  return commonService.okResponse(res, {
    materialTypes: uniqueMaterialTypes
  });

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
    const { material_type, purity_percentage } = req.body;

    const effectiveMaterialType = material_type ?? entity.material_type;
    const effectivePurity =
      purity_percentage !== undefined
        ? purity_percentage
        : entity.purity_percentage;

    // Check if the resulting material_type + purity combination collides
    // with another record. Different purities of the same material_type
    // (e.g. Gold 22K vs Gold 24K) are allowed to coexist.
    if (
      material_type !== undefined ||
      purity_percentage !== undefined
    ) {
      const existingMaterialType = await models.MaterialType.findOne({
        where: {
          material_type: effectiveMaterialType,
          purity_percentage: effectivePurity ?? null,
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

    const savedMaterials = [];

    for (const item of materials) {
      const { id, material_type, purity_percentage } = item;

      // A row with no id is a brand-new material + purity variant
      // (e.g. adding Gold 22K alongside an existing Gold 24K row) —
      // create it instead of requiring a pre-existing id.
      let entity = null;
      if (id) {
        entity = await models.MaterialType.findByPk(id, {
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
      }

      const effectiveMaterialType = material_type ?? entity?.material_type;
      const effectivePurity =
        purity_percentage !== undefined
          ? purity_percentage
          : entity?.purity_percentage;

      if (!effectiveMaterialType) {
        await transaction.rollback();
        return commonService.badRequest(res, "material_type is required");
      }

      // Duplicate (material_type + purity_percentage) check — different
      // purities of the same material_type are allowed to coexist, but the
      // exact same combination can't appear twice.
      const duplicateWhere = {
        material_type: effectiveMaterialType,
        purity_percentage: effectivePurity ?? null,
        deleted_at: null,
      };
      if (entity) {
        duplicateWhere.id = { [Op.ne]: entity.id };
      }

      const existingMaterialType = await models.MaterialType.findOne({
        where: duplicateWhere,
        paranoid: false,
        transaction,
      });

      if (existingMaterialType) {
        await transaction.rollback();
        return commonService.badRequest(
          res,
          `Material type '${effectiveMaterialType}'${
            effectivePurity !== undefined && effectivePurity !== null
              ? ` (${effectivePurity}%)`
              : ""
          } already exists`
        );
      }

      //  Remove id / null / undefined fields
      const rowData = { ...item };
      delete rowData.id;

      Object.keys(rowData).forEach((key) => {
        if (rowData[key] === undefined || rowData[key] === null) {
          delete rowData[key];
        }
      });

      if (entity) {
        await entity.update(rowData, { transaction });
        savedMaterials.push(entity);
      } else {
        const created = await models.MaterialType.create(rowData, {
          transaction,
        });
        savedMaterials.push(created);
      }
    }

    await transaction.commit();

    return commonService.okResponse(res, {
      message: "Materials saved successfully",
      materials: savedMaterials,
    });

  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

const deleteMaterialType = async (req, res) => {
  try {
    const materialTypeId = req.params.id;

    // 1. Check material type exists
    const materialType = await models.MaterialType.findOne({
      where: { id: materialTypeId }
    });

    if (!materialType) {
      return res.status(404).json({
        message: "Material type not found"
      });
    }

    // 2. Check categories
    const categoryCount = await models.Category.count({
      where: { material_type_id: materialTypeId }
    });

    if (categoryCount > 0) {
      return res.status(400).json({
        message: "Cannot delete material type. Categories exist under this material type."
      });
    }

    // 3. Check subcategories
    const subCategoryCount = await models.Subcategory.count({
      where: { materialtype_id: materialTypeId }
    });

    if (subCategoryCount > 0) {
      return res.status(400).json({
        message: "Cannot delete material type. Subcategories exist under this material type."
      });
    }

    // 4. Safe to delete
    await materialType.destroy();

    return res.status(204).send();

  } catch (err) {
    console.error("Delete MaterialType Error:", err);
    return res.status(500).json({
      message: "Something went wrong while deleting material type"
    });
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
