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

// List all GRNs with pagination and filters
const getAllGrns = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      vendor_id, 
      start_date, 
      end_date,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};
    
    // Apply filters
    if (vendor_id) where.vendor_id = vendor_id;
    if (start_date || end_date) {
      where.grn_date = {};
      if (start_date) where.grn_date[sequelize.Op.gte] = start_date;
      if (end_date) where.grn_date[sequelize.Op.lte] = end_date;
    }
    
    // Search in GRN number or reference
    if (search) {
      where[sequelize.Op.or] = [
        { grn_no: { [sequelize.Op.iLike]: `%${search}%` } },
        { reference_id: { [sequelize.Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await models.Grn.findAndCountAll({
      where,
      include: [
        { 
          model: models.Vendor, 
          attributes: ['id', 'vendor_name'],
          required: false
        }
      ],
      order: [["grn_date", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    return commonService.okResponse(res, {
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
      data: rows
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
