const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create GRN with items
const createGrn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], ...grnData } = req.body;

    // Required validation
    const requiredFields = ["grn_no", "grn_date", "vendor_id"];
    for (const field of requiredFields) {
      if (!grnData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    // Create GRN
    const grn = await models.Grn.create(grnData, { transaction });

    // Insert items directly (NO backend calculations)
    const processedItems = items.map((item) => ({
      ...item,
      grn_id: grn.id
    }));

    if (processedItems.length > 0) {
      await models.GrnItem.bulkCreate(processedItems, { transaction });
    }

    await transaction.commit();

    const result = await getGrnWithItems(grn.id);
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error("GRN Create Error =>", error);
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

    // HARD DELETE old items
    await models.GrnItem.destroy({
      where: { grn_id: id },
      force: true,
      transaction,
    });

    // Insert new items
    const newItems = items.map((item) => ({
      ...item,
      grn_id: id,
    }));

    if (newItems.length > 0) {
      await models.GrnItem.bulkCreate(newItems, { transaction });
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
      search,
    } = req.query;

    const offset = (page - 1) * limit;
    const replacements = { limit: parseInt(limit), offset };

    // Build WHERE
    const whereConditions = [`g.deleted_at IS NULL`];
    if (vendor_id) { whereConditions.push(`g.vendor_id = :vendor_id`); replacements.vendor_id = vendor_id; }
    if (branch_id) { whereConditions.push(`g.branch_id = :branch_id`); replacements.branch_id = branch_id; }
    if (start_date) { whereConditions.push(`g.grn_date >= :start_date`); replacements.start_date = start_date; }
    if (end_date) { whereConditions.push(`g.grn_date <= :end_date`); replacements.end_date = end_date; }
    if (search) { whereConditions.push(`(g.grn_no ILIKE :search OR v.vendor_name ILIKE :search)`); replacements.search = `%${search}%`; }

    const whereSql = whereConditions.length > 1 ? `WHERE ${whereConditions.join(' AND ')}` : 'WHERE g.deleted_at IS NULL';

    // SUMMARY
    const [summaryRows] = await sequelize.query(
      `SELECT 
         COUNT(*) AS total_grns,
         COUNT(*) FILTER (WHERE g.status_id = 1) AS updated_count,
         COUNT(*) FILTER (WHERE g.status_id = 2) AS yet_to_update_count
       FROM grns g
       LEFT JOIN vendors v ON v.id = g.vendor_id
       ${whereSql}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    const listRows = await sequelize.query(
      `SELECT 
     g.id,
     g.grn_no,
     g.grn_date AS date,
     g.status_id,
     v.id AS vendor_id,
     v.vendor_name,
     v.vendor_image_url,
     g.total_gross_wt_in_g AS "order",
     u.email AS created_by,
     p.total_grn_value
   FROM grns g
   LEFT JOIN vendors v ON v.id = g.vendor_id
   LEFT JOIN "grnItems" gi ON gi.grn_id = g.id AND gi.deleted_at IS NULL
   LEFT JOIN users u ON u.id = g.order_by_user_id
   LEFT JOIN LATERAL (
     SELECT total_grn_value 
     FROM products 
     WHERE grn_id = g.id
   ) p ON true
   ${whereSql}
   GROUP BY g.id, v.id, v.vendor_name, v.vendor_image_url, u.email, p.total_grn_value
   ORDER BY g.grn_date DESC, g.grn_no DESC
   LIMIT :limit OFFSET :offset`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    // Apply business logic to each row
    const transformedRows = listRows.map(row => {
      const order = parseFloat(row.order) || 0;
      const updatedVal = row.total_grn_value !== null ? parseFloat(row.total_grn_value) : null;

      let updated = 0;
      let yetToUpdate = 0;
      let status_id = row.status_id;

      // CASE 1 & CASE 2: total_grn_value exists
      if (updatedVal !== null) {
        updated = updatedVal;
        yetToUpdate = order - updatedVal;

        // CASE 2 — Completed
        if (yetToUpdate === 0) {
          status_id = 2;
        } else {
          status_id = 1;
        }
      } else {
        // CASE 3 — No GRN value
        updated = 0;
        yetToUpdate = order;
        status_id = 1;
      }

      return {
        ...row,
        updated,
        yetToUpdate,
        status_id,
      };
    });

    // TOTAL COUNT
    const [countRow] = await sequelize.query(
      `SELECT COUNT(DISTINCT g.id) AS total
       FROM grns g
       LEFT JOIN vendors v ON v.id = g.vendor_id
       ${whereSql}`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    const total = parseInt(countRow.total, 10);

    return commonService.okResponse(res, {
      summary: {
        totalGrns: parseInt(summaryRows.total_grns),
        updated: parseInt(summaryRows.updated_count),
        yetToUpdate: parseInt(summaryRows.yet_to_update_count),
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
      data: transformedRows,
    });

  } catch (error) {
    console.error("getAllGrns Error:", error);
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
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.Grn,
      "grn_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
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
          g.total_amount,
          g.total_gross_wt_in_g,
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
          gi.*,
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

    return commonService.okResponse(res, {
      header: headerRows[0],
      items,
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