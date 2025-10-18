const { models } = require("../models/index");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

const createCategory = async (req, res) => {
  try {
    const { material_type_id, category_name, category_image_url } = req.body;

    if (!material_type_id || !category_name) {
      return commonService.badRequest(
        res,
        enMessage.failure.requiredMaterialAndCategory
      );
    }

    const materialType = await models.MaterialType.findByPk(material_type_id);
    if (!materialType) {
      return commonService.badRequest(res, "Material type not found");
    }

    const row = await models.Category.create({
      material_type_id,
      category_name,
      category_image_url,
    });

    return commonService.createdResponse(res, { category: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllCategories = async (req, res) => {
  try {
    const { materialType, search } = req.query;

    let query = `
      SELECT
        c.id,
        c.category_name,
        c.category_image_url,
        c.material_type_id,
        mt.material_type AS material_type
      FROM categories c
      LEFT JOIN "materialTypes" mt ON mt.id = c.material_type_id
      WHERE 1=1
    `;

    const replacements = {};

    // Filter by Material Type
    if (materialType) {
      query += ` AND mt.material_type ILIKE :materialType`;
      replacements.materialType = `%${materialType}%`;
    }

    // Search across fields
    if (search) {
      const searchableFields = [
        "c.category_name",
        "mt.material_type"
      ];
      query += ` AND (${searchableFields.map(f => `${f} ILIKE :search`).join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    // Sorting
    query += ` ORDER BY c.id ASC`;

    const [categories] = await sequelize.query(query, { replacements });

    return commonService.okResponse(res, { categories });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listCategories = async (req, res) => {
  try {
    const { material_type_id, search = "" } = req.query;
    const where = {};
    if (material_type_id) where.material_type_id = material_type_id;

    const items = await models.Category.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { categories: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listCategoriesDropdown = async (req, res) => {
  try {
    const { material_type_id } = req.query;
    const where = {};
    if (material_type_id) where.material_type_id = material_type_id;

    const items = await models.Category.findAll({
      attributes: ["id", "category_name"],
      where,
      order: [["category_name", "ASC"]],
    });

    return commonService.okResponse(res, { categories: items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getCategoryById = async (req, res) => {
  const entity = await commonService.findById(
    models.Category,
    req.params.id,
    res
  );
  if (!entity) return;
  return commonService.okResponse(res, { category: entity });
};

const updateCategory = async (req, res) => {
  const entity = await commonService.findById(
    models.Category,
    req.params.id,
    res
  );
  if (!entity) return;

  try {
    await entity.update(req.body);
    return commonService.okResponse(res, { category: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const deleteCategory = async (req, res) => {
  const entity = await commonService.findById(
    models.Category,
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
  createCategory,
  listCategories,
  getAllCategories,
  listCategoriesDropdown,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
