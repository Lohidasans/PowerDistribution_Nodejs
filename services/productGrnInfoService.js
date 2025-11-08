const { models, sequelize } = require("../models");
const commonService = require("./commonService");

// Create Product GRN Info
const createProductGrnInfo = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const data = req.body;

    // Validate required fields
    const requiredFields = ["material_type_id", "category_id", "subcategory_id"];
    for (const field of requiredFields) {
      if (!data[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    // Create Product GRN Info
    const productGrnInfo = await models.ProductGrnInfo.create(data, { transaction });

    await transaction.commit();
    const result = await getProductGrnInfoWithDetails(productGrnInfo.id);
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get Product GRN Info by ID with details
const getProductGrnInfoById = async (req, res) => {
  try {
    const { id } = req.params;
    const productGrnInfo = await getProductGrnInfoWithDetails(id);

    if (!productGrnInfo) {
      return commonService.notFound(res, "Product GRN Info not found");
    }

    return commonService.okResponse(res, productGrnInfo);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Get all Product GRN Infos with filters
const getAllProductGrnInfos = async (req, res) => {
  try {
    const { ref_no, material_type_id, category_id, subcategory_id, page = 1, limit = 10 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build dynamic WHERE clause
    let whereSql = "WHERE pgi.deleted_at IS NULL";
    const replacements = { limit: parseInt(limit), offset };

    if (material_type_id) {
      whereSql += " AND pgi.material_type_id = :material_type_id";
      replacements.material_type_id = material_type_id;
    }
    if (category_id) {
      whereSql += " AND pgi.category_id = :category_id";
      replacements.category_id = category_id;
    }
    if (subcategory_id) {
      whereSql += " AND pgi.subcategory_id = :subcategory_id";
      replacements.subcategory_id = subcategory_id;
    }
    if (ref_no) {
      whereSql += " AND pgi.ref_no = :ref_no";
      replacements.ref_no = ref_no;
    }

    // Count total
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM product_grn_infos pgi
      ${whereSql};
    `;
    const [countRows] = await sequelize.query(countQuery, { replacements });
    const total = parseInt(countRows?.[0]?.total || 0, 10);

    // Get data with joins
    const dataQuery = `
      SELECT 
        pgi.*,
        mt.material_type AS material_type_name,
        c.category_name,
        sc.subcategory_name
      FROM product_grn_infos pgi
      LEFT JOIN "materialTypes" mt ON pgi.material_type_id = mt.id
      LEFT JOIN categories c ON pgi.category_id = c.id
      LEFT JOIN subcategories sc ON pgi.subcategory_id = sc.id
      ${whereSql}
      ORDER BY pgi.id DESC
      LIMIT :limit OFFSET :offset;
    `;

    const [rows] = await sequelize.query(dataQuery, { replacements });

    return commonService.okResponse(res, {
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: rows,
    });
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Delete Product GRN Info (soft delete)
const deleteProductGrnInfo = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const productGrnInfo = await models.ProductGrnInfo.findByPk(id, { transaction });

    if (!productGrnInfo) {
      await transaction.rollback();
      return commonService.notFound(res, "Product GRN Info not found");
    }

    // Soft delete
    await productGrnInfo.destroy({ transaction });

    await transaction.commit();
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Helper function to get Product GRN Info with related details
const getProductGrnInfoWithDetails = async (id) => {
  try {
    const dataQuery = `
      SELECT 
        pgi.*,
        mt.material_type AS material_type_name,
        c.category_name,
        sc.subcategory_name
      FROM product_grn_infos pgi
      LEFT JOIN "materialTypes" mt ON pgi.material_type_id = mt.id
      LEFT JOIN categories c ON pgi.category_id = c.id
      LEFT JOIN subcategories sc ON pgi.subcategory_id = sc.id
      WHERE pgi.id = :id AND pgi.deleted_at IS NULL
      LIMIT 1;
    `;

    const [rows] = await sequelize.query(dataQuery, {
      replacements: { id },
    });

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("Error in getProductGrnInfoWithDetails:", error);
    throw error;
  }
};

module.exports = {
  createProductGrnInfo,
  getProductGrnInfoById,
  getAllProductGrnInfos,
  deleteProductGrnInfo,
};

