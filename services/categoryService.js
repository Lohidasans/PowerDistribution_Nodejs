const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");

const createCategory = async (req, res) => {
  try {
    const { material_type_id, category_name, category_image_url, short_name } = req.body;

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
      short_name,
    });

    return commonService.createdResponse(res, { category: row });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllCategories = async (req, res) => {
  try {
    const { materialType, material_type_id, search } = req.query;

    let query = `
      SELECT
        c.id,
        c.category_name,
        c.short_name,
        c.category_image_url,
        c.material_type_id,
        mt.material_type,
        mt.material_image_url
      FROM categories c
      LEFT JOIN "materialTypes" mt ON mt.id = c.material_type_id
       WHERE c.deleted_at IS NULL
    `;

    const replacements = {};

    // 🔹 Filter by Material Type ID (numeric)
    if (material_type_id) {
      query += ` AND c.material_type_id = :material_type_id`;
      replacements.material_type_id = material_type_id;
    }

    // 🔹 Filter by Material Type Name (text)
    if (materialType) {
      query += ` AND mt.material_type ILIKE :materialType`;
      replacements.materialType = `%${materialType}%`;
    }

    // 🔹 Search across multiple fields
    if (search) {
      const searchableFields = ["c.category_name", "mt.material_type"];
      query += ` AND (${searchableFields
        .map((f) => `${f} ILIKE :search`)
        .join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    // 🔹 Sorting
    query += ` ORDER BY c.id ASC`;

    // 🔹 Execute query
    const [categories] = await sequelize.query(query, { replacements });

    // 🔹 Send response
    return commonService.okResponse(res, { categories });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listCategories = async (req, res) => {
  try {
    const { material_type_id, search = "" } = req.query;

    let sql = `
      SELECT
        c.id,
        c.category_name,
        c.category_image_url,
        c.material_type_id,
        c.description,
        c.sort_order,
        c.status,
        c.created_at,
        c.updated_at,
        mt.material_type,
        mt.material_image_url
      FROM categories c
      LEFT JOIN "materialTypes" mt ON mt.id = c.material_type_id
      WHERE c.deleted_at IS NULL
    `;

    const replacements = {};
    if (material_type_id) {
      sql += ` AND c.material_type_id = :material_type_id`;
      replacements.material_type_id = +material_type_id;
    }
    if (search && String(search).trim() !== "") {
      sql += ` AND (c.category_name ILIKE :search OR mt.material_type ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    sql += ` ORDER BY c.created_at DESC`;

    const [rows] = await sequelize.query(sql, { replacements });
    return commonService.okResponse(res, { categories: rows });
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
      attributes: ["id", "category_name", "short_name"],
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
    // Check if Subcategories exist for this Category
    const subcatCount = await models.Subcategory.count({
      where: { category_id: req.params.id }
    });

    if (subcatCount > 0) {
      return commonService.badRequest(
        res,
        "Cannot delete category. Subcategories exist under this category."
      );
    }
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
