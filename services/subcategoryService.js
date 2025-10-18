const { models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const { buildSearchCondition } = require("../helpers/queryHelper");

const createSubcategory = async (req, res) => {
  try {
    const {
      materialType_id,
      category_id,
      subcategory_name,
      subcategory_image_url,
      reorder_level,
      making_changes,
      Margin,
    } = req.body;

    if (!materialType_id || !category_id || !subcategory_name)
      return commonService.badRequest(
        res,
        enMessage.failure.requiredMaterialCategoryAndSub
      );

    const row = await models.Subcategory.create({
      materialType_id,
      category_id,
      subcategory_name,
      subcategory_image_url,
      reorder_level,
      making_changes,
      Margin,
    });

    return commonService.createdResponse(res, { subcategory: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listSubcategories = async (req, res) => {
  try {
    const { materialType_id, category_id, search = "" } = req.query;
    const where = {};

    if (materialType_id) where.materialType_id = materialType_id;
    if (category_id) where.category_id = category_id;

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
    const { materialType_id, category_id } = req.query;
    const where = {};

    if (materialType_id) where.materialType_id = materialType_id;
    if (category_id) where.category_id = category_id;

    const items = await models.Subcategory.findAll({
      attributes: ["id", "subcategory_name"],
      where,
      order: [["subcategory_name", "ASC"]],
    });

    return commonService.okResponse(res, { subcategories: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllSubCategories = async (req, res) => {
  try {
    const { materialType, category, search } = req.query;

    let query = `
      SELECT
        sc.id,
        sc.subcategory_name,
        sc.subcategory_image_url,
        sc.reorder_level,
        sc.category_id,
        c.category_name,
        c.category_image_url,
        mt.material_type AS material_type
      FROM "subcategories" sc
      LEFT JOIN categories c ON c.id = sc.category_id
      LEFT JOIN "materialTypes" mt ON mt.id = c.material_type_id
      WHERE 1=1
    `;

    const replacements = {};

    //  Filter by Material Type
    if (materialType) {
      query += ` AND mt.material_type ILIKE :materialType`;
      replacements.materialType = `%${materialType}%`;
    }

    // Filter by Category
    if (category) {
      query += ` AND c.category_name ILIKE :category`;
      replacements.category = `%${category}%`;
    }

    // Search across fields
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

    const [subCategories] = await sequelize.query(query, { replacements });

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

module.exports = {
  createSubcategory,
  listSubcategories,
  getAllSubCategories,
  listSubcategoriesDropdown,
  getSubcategoryById,
  updateSubcategory,
  deleteSubcategory,
};
