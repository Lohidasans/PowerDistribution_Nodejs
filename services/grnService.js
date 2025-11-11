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

// Update GRN and its items (upsert by item.id; do not destroy existing rows)
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

    // Update GRN header fields
    await grn.update(updateData, { transaction });

    // Update each existing item only when id is provided. Items without id are ignored.
    for (const item of items) {
      if (item && item.id) {
        const existingItem = await models.GrnItem.findOne({
          where: { id: item.id, grn_id: id },
          transaction,
        });
        if (existingItem) {
          const { id: _omit, grn_id: _omit2, created_at, updated_at, deleted_at, ...updatable } = item; // ignore non-updatable
          await existingItem.update(updatable, { transaction });
        }
      }
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
    return commonService.noContentResponse(res);
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
        COALESCE(SUM(gi.quantity), 0) AS quantity,
        COALESCE(SUM(gi.ordered_weight), 0) AS ordered_weight,
        COALESCE(SUM(gi.received_weight), 0) AS received_weight,
        COALESCE(SUM(gi.amount), 0) AS total_amount,
        u.email as created_by
      FROM grns g
      ${joinVendors}
      LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
      LEFT JOIN users u ON u.id = g.order_by_user_id
      ${whereSql}
      GROUP BY g.id, v.vendor_name, v.id, v.vendor_image_url, u.email
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


// GET: list of GRN numbers with full ProductGrnInfo + joined details
const listGrnNumbers = async (req, res) => {
  try {
    // 1.Fetch all GRNs (base info)
    const grns = await models.Grn.findAll({
      attributes: ["id", "grn_no", "grn_date", "grn_info_ids"],
      order: [["created_at", "DESC"]],
      raw: true,
    });

    // 2.Collect all grn_info_ids across GRNs
    const allInfoIds = grns.flatMap(g => g.grn_info_ids || []);
    if (allInfoIds.length === 0) {
      return commonService.okResponse(res, { grns });
    }

    // 3.Fetch all ProductGrnInfo rows with extra joins
    const grnInfos = await sequelize.query(`
      SELECT 
        pgi.*,
        mt.material_type AS material_type_name,
        c.category_name,
        sc.subcategory_name
      FROM product_grn_infos pgi
      LEFT JOIN "materialTypes" mt ON pgi.material_type_id = mt.id
      LEFT JOIN categories c ON pgi.category_id = c.id
      LEFT JOIN subcategories sc ON pgi.subcategory_id = sc.id
      WHERE pgi.id IN (:infoIds)
    `, {
      replacements: { infoIds: allInfoIds },
      type: sequelize.QueryTypes.SELECT,
    });

    // 4️.Create lookup map for quick access
    const grnInfoMap = {};
    grnInfos.forEach(info => {
      grnInfoMap[info.id] = info;
    });

    // 5️.Replace grn_info_ids (array of IDs) with detailed objects
    const enrichedGrns = grns.map(grn => ({
      ...grn,
      grn_info_ids: (grn.grn_info_ids || [])
        .map(id => grnInfoMap[id])
        .filter(Boolean),
    }));

    return commonService.okResponse(res, { grns: enrichedGrns });
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

// Detailed view for GRN page (joins: vendor + location + item master names)
const getGrnView = async (req, res) => {
  try {
    const { id } = req.params;

    // Header + vendor + location names
    const [headerRows] = await sequelize.query(`
        SELECT 
          g.id,
          g.grn_no,
          g.grn_date,
          g.reference_id,
          g.subtotal_amount,
          g.sgst_percent,
          g.cgst_percent,
          g.discount_percent,
          g.remarks,
          g.gst_no,
          g.billing_address,
          g.shipping_address,
          po.po_no,
          po.po_date,
          v.id               AS vendor_id,
          v.vendor_name,
          v.address          AS vendor_address,
          v.mobile           AS vendor_mobile,
          v.gst_no           AS vendor_gst_no,
          d.district_name    AS vendor_district,
          s.state_name       AS vendor_state,
          c.country_name     AS vendor_country
        FROM grns g
        LEFT JOIN vendors v   ON v.id = g.vendor_id
        LEFT JOIN purchase_orders po ON po.id = g.po_id
        LEFT JOIN districts d ON d.id = v.district_id
        LEFT JOIN states s    ON s.id = v.state_id
        LEFT JOIN countries c ON c.id = v.country_id
        WHERE g.id = :id
        LIMIT 1;
      `, { replacements: { id } });

    if (!headerRows || headerRows.length === 0) {
      return commonService.notFound(res, "GRN not found");
    }

    // Items with material/category/subcategory names
    const [items] = await sequelize.query(`
        SELECT 
          gi.id,
          gi.description,
          gi.purity,
          gi.ordered_weight,
          gi.received_weight,
          gi.quantity,
          gi.rate,
          gi.amount,
          mt.material_type   AS material_type_name,
          c.category_name    AS category_name,
          sc.subcategory_name AS subcategory_name
        FROM "grnItems" gi
        LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
        LEFT JOIN categories c       ON gi.category_id = c.id
        LEFT JOIN subcategories sc   ON gi.subcategory_id = sc.id
        WHERE gi.grn_id = :id AND gi.deleted_at IS NULL
        ORDER BY gi.id ASC;
      `, { replacements: { id } });

    // Totals (weights and amount)
    const [totalsRows] = await sequelize.query(`
        SELECT 
          COALESCE(SUM(gi.ordered_weight), 0)  AS total_ordered_weight,
          COALESCE(SUM(gi.received_weight), 0) AS total_received_weight,
          COALESCE(SUM(gi.amount), 0)          AS total_amount
        FROM "grnItems" gi
        WHERE gi.grn_id = :id AND gi.deleted_at IS NULL;
      `, { replacements: { id } });

    return commonService.okResponse(res, {
      header: headerRows[0],
      items,
      totals: totalsRows[0]
    });
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
  generateGrnCode,
  getGrnView,
};