const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create GRN with items
const createGrn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], ...grnData } = req.body;
    const { grn_no } = grnData;

    // Required validation
    const requiredFields = ["grn_no", "grn_date", "vendor_id"];
    for (const field of requiredFields) {
      if (!grnData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    // Check if a non-deleted grn already uses this code
    if (grn_no) {
      const existing = await models.Grn.findOne({
        where: {
          grn_no: grn_no,
          deleted_at: null,     // only check active (non-deleted) records
        },
      });

      if (existing) {
        return commonService.badRequest(res, {
          message: "Grn code already exists",
        });
      }
    }
        
    // Create GRN
    const grn = await models.Grn.create(grnData, { transaction });

    // Insert items directly (NO backend calculations)
    const processedItems = items.map((item) => ({
      ...item,
      grn_id: grn.id,
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
      nest: true,
    });

    if (!grn) return null;

    // Get GRN items
    const items = await sequelize.query(
      `
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
      `,
      {
        replacements: { grnId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Fetch Purchase Order Date
    let purchaseOrder = null;
    if (grn.po_id) {
      purchaseOrder = await models.PurchaseOrder.findByPk(grn.po_id, {
        attributes: ["id", "po_no", "po_date"],
        raw: true,
      });
    }

    // Get vendor details
    const vendor = (await models.Vendor.findByPk(grn.vendor_id, {
        attributes: ["id", "vendor_name"],
        raw: true,
      })) || { id: grn.vendor_id, vendor_name: "Vendor Not Found"};

    // Get user details
    let user = null;
    if (grn.order_by_user_id) {
      user = await models.User.findByPk(grn.order_by_user_id, {
        attributes: ["id", "email"],
        raw: true,
      });

      if (!user) {
        user = {
          id: grn.order_by_user_id,
          email: "User Not Found",
        };
      }
    }

    return {
      ...grn,
      purchase_order: purchaseOrder, // po_date comes here
      vendor,
      order_by_user: user,
      items,
    };
  } catch (error) {
    console.error("Error in getGrnWithItems:", error);
    throw error;
  }
};


// Update GRN and its items (upsert by item.id; do not destroy existing rows)
const updateGrn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], grn_no, ...updateData } = req.body;

    // Find existing GRN
    const grn = await models.Grn.findByPk(id, { transaction });
    if (!grn) {
      await transaction.rollback();
      return commonService.notFound(res, "GRN not found");
    }

    // CHECK: Is GRN already used in products?
    const productExists = await models.Product.findOne({
      where: { grn_id: id },
      attributes: ["id"],
      transaction,
    });

    if (productExists) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "This GRN is already used in products and cannot be modified"
      );
    }

    // GRN NO VALIDATION (only if provided)
    if (grn_no) {
      const existing = await models.Grn.findOne({
        where: {
          grn_no,
          id: { [Op.ne]: id },   // exclude current GRN
          deleted_at: null,
        },
      });

      if (existing) {
        await transaction.rollback();
        return commonService.badRequest(res, "GRN number already exists");
      }
    }
    // Update GRN header fields
    await grn.update(
      { ...updateData, ...(grn_no && { grn_no }) },
      { transaction }
    );

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
        transaction,
      }),
    ]);

    await transaction.commit();
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// List all GRNs (NO pagination)
const getAllGrns = async (req, res) => {
  try {
    const {
      vendor_id,
      branch_id,
      start_date,
      end_date,
      search,
    } = req.query;

    const replacements = {};
    const whereConditions = [`g.deleted_at IS NULL`];

    if (vendor_id) {
      whereConditions.push(`g.vendor_id = :vendor_id`);
      replacements.vendor_id = vendor_id;
    }
    if (branch_id) {
      whereConditions.push(`g.branch_id = :branch_id`);
      replacements.branch_id = branch_id;
    }
    if (start_date) {
      whereConditions.push(`g.grn_date >= :start_date`);
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereConditions.push(`g.grn_date <= :end_date`);
      replacements.end_date = end_date;
    }
    if (search) {
      whereConditions.push(
        `(g.grn_no ILIKE :search OR v.vendor_name ILIKE :search)`
      );
      replacements.search = `%${search}%`;
    }

    const whereSql =
      whereConditions.length > 1
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "WHERE g.deleted_at IS NULL";

    // Fetch ALL GRNs with calculated weights
    const listRows = await sequelize.query(
      `SELECT
         g.id,
         g.grn_no,
         g.grn_date AS date,
         g.status_id,
         v.id AS vendor_id,
         v.vendor_name,
         v.vendor_image_url,
         COALESCE(gi.total_net_weight, 0) AS "order",
         u.email_id AS created_by,
         d.district_name AS location,
         COALESCE(pi.total_updated_weight, 0) AS updated_weight
       FROM grns g
       LEFT JOIN vendors v ON v.id = g.vendor_id
       LEFT JOIN superadmin_profiles u ON u.id = g.order_by_user_id
       LEFT JOIN districts d ON d.id = u.district_id  -- Join with districts table
       LEFT JOIN (
         SELECT 
           grn_id, 
           COALESCE(SUM(net_wt_in_g), 0) as total_net_weight
         FROM "grnItems"
         WHERE deleted_at IS NULL
         GROUP BY grn_id
       ) gi ON gi.grn_id = g.id
       LEFT JOIN (
        SELECT 
          p.grn_id,
          COALESCE(SUM(pid.net_weight), 0) as total_updated_weight
        FROM products p
        JOIN "productItemDetails" pid ON pid.product_id = p.id AND pid.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.grn_id
      ) pi ON pi.grn_id = g.id
       ${whereSql}
       GROUP BY g.id, v.id, v.vendor_name, v.vendor_image_url, u.email_id, gi.total_net_weight, pi.total_updated_weight, d.district_name
       ORDER BY g.created_at DESC, g.grn_date DESC, g.grn_no DESC`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    // Apply business logic
    let updatedCount = 0;
    let yetToUpdateCount = 0;

    const transformedRows = listRows.map((row) => {
      const order = parseFloat(row.order) || 0;
      const updated = parseFloat(row.updated_weight) || 0;
      const yetToUpdate = Math.max(0, order - updated);
      const status_id = yetToUpdate <= 0.001 ? 2 : 1; // Using small epsilon for float comparison

      // Count using computed status
      if (status_id === 2) updatedCount++;
      else yetToUpdateCount++;

      return {
        ...row,
        order: parseFloat(order.toFixed(3)),
        updated: parseFloat(updated.toFixed(3)),
        yetToUpdate: parseFloat(yetToUpdate.toFixed(3)),
        status_id,
      };
    });

    return commonService.okResponse(res, {
      summary: {
        totalGrns: transformedRows.length,
        updated: updatedCount,
        yetToUpdate: yetToUpdateCount,
      },
      totalItems: transformedRows.length,
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
    const { vendor_id } = req.query;
    // Base condition: only active GRNs
    const whereCondition = {
      is_active: true,
    };

    // Optional vendor filter
    if (vendor_id) {
      whereCondition.vendor_id = vendor_id;
    }

    // 1.Fetch filtered GRNs
    const grns = await models.Grn.findAll({
      where: whereCondition,
      attributes: ["id", "grn_no", "grn_date", "vendor_id"],
      order: [["created_at", "DESC"]],
      raw: true,
    });

    if (grns.length === 0) {
      return commonService.okResponse(res, { grns: [] });
    }

    const grnIds = grns.map((g) => g.id);

    // 2.Fetch all grnItems for these GRNs
    const grnItems = await sequelize.query(
      `SELECT
        gi.*,
        mt.material_type AS material_type_name,
        c.category_name,
        sc.subcategory_name
      FROM "grnItems" gi
      LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
      LEFT JOIN categories c ON gi.category_id = c.id
      LEFT JOIN subcategories sc ON gi.subcategory_id = sc.id
      WHERE gi.grn_id IN (:grnIds)
      ORDER BY gi.id`,
      {
        replacements: { grnIds },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // 3.Group items
    const groupedItems = {};
    grnItems.forEach((item) => {
      if (!groupedItems[item.grn_id]) groupedItems[item.grn_id] = [];
      groupedItems[item.grn_id].push(item);
    });

    // 4.Attach items
    const enrichedGrns = grns.map((grn) => ({
      ...grn,
      grn_info_ids: groupedItems[grn.id] || [],
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
    const [headerRows] = await sequelize.query(
      `
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
      `,
      { replacements: { id } }
    );

    if (!headerRows || headerRows.length === 0) {
      return commonService.notFound(res, "GRN not found");
    }

    // Items with material/category/subcategory names
    const [items] = await sequelize.query(
      `
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
      `,
      { replacements: { id } }
    );

    return commonService.okResponse(res, {
      header: headerRows[0],
      items,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getAllGrnInfos = async (req, res) => {
  try {
    const {
      ref_no,
      material_type_id,
      category_id,
      subcategory_id,
      page = 1,
      limit = 10,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build dynamic WHERE clause
    let whereSql = "WHERE gi.deleted_at IS NULL";
    const replacements = { limit: parseInt(limit), offset };

    if (material_type_id) {
      whereSql += " AND gi.material_type_id = :material_type_id";
      replacements.material_type_id = material_type_id;
    }
    if (category_id) {
      whereSql += " AND gi.category_id = :category_id";
      replacements.category_id = category_id;
    }
    if (subcategory_id) {
      whereSql += " AND gi.subcategory_id = :subcategory_id";
      replacements.subcategory_id = subcategory_id;
    }
    if (ref_no) {
      whereSql += " AND gi.ref_no = :ref_no";
      replacements.ref_no = ref_no;
    }

    // Count total
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM "grnItems" gi
      ${whereSql};
    `;
    const [countRows] = await sequelize.query(countQuery, { replacements });
    const total = parseInt(countRows?.[0]?.total || 0, 10);

    // Get data with joins
    const dataQuery = `
      SELECT
        gi.*,
        mt.material_type AS material_type_name,
        c.category_name,
        sc.subcategory_name
      FROM "grnItems" gi
      LEFT JOIN "materialTypes" mt ON gi.material_type_id = mt.id
      LEFT JOIN categories c ON gi.category_id = c.id
      LEFT JOIN subcategories sc ON gi.subcategory_id = sc.id
      ${whereSql}
      ORDER BY gi.id DESC
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

const updateGrnStatus = async (req, res) => {
  const { grn_id } = req.params;
  const { is_active } = req.body;  
  const t = await sequelize.transaction();

  try {
    // 1. Check GRN exists
    const grn = await models.Grn.findOne({
      where: { id: grn_id },
      transaction: t,
    });

    if (!grn) {
      await t.rollback();
      return commonService.notFound(res, "GRN not found");
    }

    // 2️. Check if GRN has items
    if (is_active === false) {
      const itemCount = await models.GrnItem.count({
        where: { grn_id },
        transaction: t,
      });

      if (itemCount > 0) {
        await t.rollback();
        return commonService.notFound(res, "Cannot deactivate GRN because items exist for this GRN");
      }
    }

    // 3️. Update is_active field
    await models.Grn.update({ is_active },
      {
        where: { id: grn_id },
        transaction: t,
      }
    )
    await t.commit();

    return commonService.okResponse(res, `GRN ${is_active ? "activated" : "deactivated"} successfully`);
  } catch (err) {
    await t.rollback();
    console.error(err);
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
  getAllGrnInfos,
  updateGrnStatus
};
