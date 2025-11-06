const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create GRN with items
const createGrn = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { items = [], ...grnData } = req.body;

    // Validate required fields
    const requiredFields = ["grn_no", "grn_date", "vendor_id"];
    for (const field of requiredFields) {
      if (!grnData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    // Create GRN
    const grn = await models.Grn.create(grnData, { transaction });

    // Create GRN items
    if (items && items.length > 0) {
      const grnItems = items.map(item => ({
        ...item,
        grn_id: grn.id
      }));
      await models.GrnItem.bulkCreate(grnItems, { transaction });
    }

    await transaction.commit();
    const result = await getGrnWithItems(grn.id);
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get GRN by ID with items
const getGrnById = async (req, res) => {
  try {
    const { id } = req.params;
    const grn = await getGrnWithItems(id);
    
    if (!grn) {
      return commonService.notFound(res, "GRN not found");
    }
    
    return commonService.okResponse(res, grn);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

const getGrnWithItems = async (grnId) => {
  try {
    // Get GRN details
    const grn = await models.Grn.findByPk(grnId, {
      raw: true,
      nest: true
    });

    if (!grn) return null;

    // Get GRN items with related data using raw queries
    const items = await sequelize.query(`
      SELECT 
        gi.*,
        mt.material_type as material_type_name,
        c.category_name as category_name,
        sc.subcategory_name as subcategory_name
      FROM "grnItems" gi
      LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
      LEFT JOIN categories c ON gi.category_id = c.id
      LEFT JOIN subcategories sc ON gi.subcategory_id = sc.id
      WHERE gi.grn_id = :grnId
      ORDER BY gi.id ASC 
    `, {
      replacements: { grnId },
      type: sequelize.QueryTypes.SELECT
    });

    // Get vendor details
    const vendor = await models.Vendor.findByPk(grn.vendor_id, {
      attributes: ['id', 'vendor_name'],
      raw: true
    }) || { id: grn.vendor_id, vendor_name: 'Vendor Not Found' };

    // Get user details if order_by_user_id exists
    let user = null;
    if (grn.order_by_user_id) {
      user = await models.User.findByPk(grn.order_by_user_id, {
        attributes: ['id', 'email'],
        raw: true
      });

      if (!user) {
        user = {
          id: grn.order_by_user_id,
          name: 'User Not Found'
        };
      }
    }

    return {
      ...grn,
      vendor,
      order_by_user: user,
      items
    };
  } catch (error) {
    console.error('Error in getGrnWithItems:', error);
    throw error;
  }
};

// Update GRN and its items
const updateGrn = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { items = [], ...updateData } = req.body;

    // Find existing GRN
    const grn = await models.Grn.findByPk(id, { transaction });
    if (!grn) {
      await transaction.rollback();
      return commonService.notFound(res, "GRN not found");
    }

    // Update GRN
    await grn.update(updateData, { transaction });

    // Delete existing items
    await models.GrnItem.destroy({ 
      where: { grn_id: id },
      transaction 
    });

    // Create new items
    if (items.length > 0) {
      const grnItems = items.map(item => ({
        ...item,
        grn_id: id
      }));
      await models.GrnItem.bulkCreate(grnItems, { transaction });
    }

    await transaction.commit();
    const result = await getGrnWithItems(id);
    return commonService.okResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Delete GRN (soft delete)
const deleteGrn = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const grn = await models.Grn.findByPk(id, { transaction });
    
    if (!grn) {
      await transaction.rollback();
      return commonService.notFound(res, "GRN not found");
    }

    // Soft delete GRN and its items
    await Promise.all([
      grn.destroy({ transaction }),
      models.GrnItem.destroy({ 
        where: { grn_id: id },
        transaction 
      })
    ]);

    await transaction.commit();
    return commonService.okResponse(res, { message: "GRN deleted successfully" });
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// List all GRNs with pagination and filters (raw SQL, joins only)
const getAllGrns = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      vendor_id, 
      branch_id,
      start_date, 
      end_date,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build dynamic WHERE with replacements
    let whereSql = "WHERE g.deleted_at IS NULL";
    const joinVendors = "LEFT JOIN vendors v ON v.id = g.vendor_id";
    const replacements = { limit: parseInt(limit), offset };

    if (vendor_id) {
      whereSql += " AND g.vendor_id = :vendor_id";
      replacements.vendor_id = vendor_id;
    }
    if (branch_id) {
      // branch_id may exist in grns table even if not in model
      whereSql += " AND g.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }
    if (start_date) {
      whereSql += " AND g.grn_date >= :start_date";
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereSql += " AND g.grn_date <= :end_date";
      replacements.end_date = end_date;
    }
    if (search) {
      whereSql += " AND (g.grn_no ILIKE :search OR v.vendor_name ILIKE :search)";
      replacements.search = `%${search}%`;
    }

    // Count total rows (distinct GRNs)
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT g.id
        FROM grns g
        ${joinVendors}
        ${whereSql}
        GROUP BY g.id
      ) t;
    `;
    const [countRows] = await sequelize.query(countQuery, { replacements });
    const total = parseInt(countRows?.[0]?.total || 0, 10);

    // Data query with joins and aggregation
    const dataQuery = `
      SELECT 
        g.id,
        g.grn_no,
        g.grn_date AS date,
        g.status_id,
        v.id as vendor_id,
        v.vendor_name,
        v.vendor_image_url,
        COALESCE(SUM(gi.ordered_weight), 0) AS ordered_weight,
        COALESCE(SUM(gi.received_weight), 0) AS received_weight
      FROM grns g
      ${joinVendors}
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      ${whereSql}
      GROUP BY g.id, v.vendor_name, v.id, v.vendor_image_url 
      ORDER BY g.grn_date DESC, g.id DESC
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

// GET: minimal list of GRN numbers for dropdowns
const listGrnNumbers = async (req, res) => {
  try {
    const rows = await models.Grn.findAll({
      attributes: ["id", "grn_no"],
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { grns: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateGrnCode = async (req, res) => {
  try {
    const { prefix, fy } = req.query || {};

    if (!prefix || !fy) {
      return commonService.badRequest(res, message.failure.requiredFields);
    }

    const code = await generateFiscalSeriesCode(
      models.Grn,
      "grn_no",
      String(prefix).toUpperCase(),
      { pad: 2, fyRange: fy }
    );
    return commonService.okResponse(res, { grn_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createGrn,
  getGrnById,
  updateGrn,
  deleteGrn,
  getAllGrns,
  listGrnNumbers,
  generateGrnCode
};
