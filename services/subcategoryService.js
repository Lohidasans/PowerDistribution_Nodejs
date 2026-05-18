const { models, sequelize } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createSubcategory = async (req, res) => {
  try {
    const {
      materialtype_id,
      category_id,
      subcategory_name,
      subcategory_image_url,
      reorder_level,
    } = req.body;

    if (!materialtype_id || !category_id || !subcategory_name)
      return commonService.badRequest(
        res,
        enMessage.failure.requiredMaterialCategoryAndSub
      );

    const row = await models.Subcategory.create({
      materialtype_id,
      category_id,
      subcategory_name,
      subcategory_image_url,
      reorder_level,
      branch_id: 1, // default to 1 if not provided
    });

    return commonService.createdResponse(res, { subcategory: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listSubcategories = async (req, res) => {
  try {
    const { materialType_id, category_id, search = "", branch_id } = req.query;
    const where = {};

    if (materialType_id) where.materialType_id = materialType_id;
    if (category_id) where.category_id = category_id;
    if (branch_id) where.branch_id = branch_id;

    const searchCondition = buildSearchCondition(search, ["subcategory_name"]);
    if (searchCondition) Object.assign(where, searchCondition);

    const items = await models.Subcategory.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { subcategories: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listSubcategoriesDropdown = async (req, res) => {
  try {
    const { materialType_id, category_id, branch_id } = req.query;
    const where = {};

    if (materialType_id) where.materialtype_id = materialType_id;
    if (category_id) where.category_id = category_id;
    if (branch_id) where.branch_id = branch_id;

    const items = await models.Subcategory.findAll({
      attributes: ["id", "subcategory_name", "branch_id"],
      where,
      order: [["subcategory_name", "ASC"]],
    });

    return commonService.okResponse(res, { subcategories: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const { QueryTypes } = require("sequelize");

const getAllSubCategories = async (req, res) => {
  try {
    const { materialType, materialtype_id, category, category_id, search, branch_id } =
      req.query;

    let query = `
      SELECT
        sc.id,
        sc.subcategory_name,
        sc.subcategory_image_url,
        sc.reorder_level,
        sc.category_id,
        sc.branch_id,
        c.category_name,
        c.category_image_url,
        sc.materialtype_id,
        sc.status,
        mt.material_type AS material_type,
        mt.material_image_url
      FROM "subcategories" sc
      LEFT JOIN categories c ON c.id = sc.category_id
      LEFT JOIN "materialTypes" mt ON mt.id = sc.materialtype_id
      WHERE sc.deleted_at IS NULL
    `;

    const replacements = {};

    // 🔹 Filter by branch_id
    if (branch_id) {
      query += ` AND sc.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    // 🔹 Filter by Material Type Name
    if (materialType) {
      query += ` AND mt.material_type ILIKE :materialType`;
      replacements.materialType = `%${materialType}%`;
    }

    // 🔹 Filter by Material Type ID (matches DB field name)
    if (materialtype_id) {
      const mtId = Number(materialtype_id);
      if (!Number.isNaN(mtId)) {
        query += ` AND sc.materialtype_id = :materialtype_id`;
        replacements.materialtype_id = mtId; // ✅ corrected key
      }
    }

    // 🔹 Filter by Category Name
    if (category) {
      query += ` AND c.category_name ILIKE :category`;
      replacements.category = `%${category}%`;
    }

    // 🔹 Filter by Category ID
    if (category_id) {
      const catId = Number(category_id);
      if (!Number.isNaN(catId)) {
        query += ` AND sc.category_id = :category_id`;
        replacements.category_id = catId;
      }
    }

    // 🔹 Search across fields
    if (search) {
      const searchableFields = [
        "sc.subcategory_name",
        "c.category_name",
        "mt.material_type",
      ];
      query += ` AND (${searchableFields
        .map((f) => `${f} ILIKE :search`)
        .join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    // 🔹 Sorting
    query += ` ORDER BY sc.id ASC`;

    const subCategories = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    });

    return commonService.okResponse(res, { subCategories });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getSubcategoryById = async (req, res) => {
  const entity = await commonService.findById(
    models.Subcategory,
    req.params.id,
    res
  );
  if (!entity) return;
  return commonService.okResponse(res, { subcategory: entity });
};

const updateSubcategory = async (req, res) => {
  const entity = await commonService.findById(
    models.Subcategory,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    const { category_id } = req.body;
    if (category_id) {
      const category = await models.Category.findByPk(category_id);
      if (!category) {
        return commonService.badRequest(
          res,
          "Invalid category_id: category does not exist."
        );
      }
    }

    await entity.update(req.body);
    return commonService.okResponse(res, { subcategory: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteSubcategory = async (req, res) => {
  const entity = await commonService.findById(
    models.Subcategory,
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

const updateSubcategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 🔹 Validation
    if (!id) {
      return commonService.badRequest(res, "Subcategory ID is required");
    }

    if (!status || !["Active", "Inactive"].includes(status)) {
      return commonService.badRequest(
        res,
        "Invalid status. Allowed values: Active / Inactive"
      );
    }

    // 🔹 Check existence
    const subcategory = await models.Subcategory.findOne({
      where: {
        id,
        deleted_at: null,
      },
    });

    if (!subcategory) {
      return commonService.notFound(res, "Subcategory not found");
    }

    // 🔹 Update status
    await models.Subcategory.update(
      { status },
      {
        where: { id },
      }
    );

    return commonService.okResponse(res, {
      message: `Subcategory status updated to ${status}`,
    });

  } catch (error) {
    console.error("Error updating subcategory status:", error);
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createSubcategory,
  listSubcategories,
  getAllSubCategories,
  listSubcategoriesDropdown,
  getSubcategoryById,
  updateSubcategory,
  deleteSubcategory,
  updateSubcategoryStatus
};
