const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create Purchase Return with items
const createPurchaseReturn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], ...prData } = req.body;

    // Validate required fields
    const requiredFields = ["pr_no", "pr_date", "vendor_id"];
    for (const field of requiredFields) {
      if (!prData[field]) {
        await transaction.rollback();
        return commonService.badRequest(res, `${field} is required`);
      }
    }

    // Create Purchase Return
    const purchaseReturn = await models.PurchaseReturn.create(prData, { transaction });

    // Create Purchase Return items
    if (items && items.length > 0) {
      const prItems = items.map(item => ({
        ...item,
        pr_id: purchaseReturn.id
      }));
      await models.PurchaseReturnItem.bulkCreate(prItems, { transaction });
    }

    await transaction.commit();
    const result = await getPurchaseReturnWithItems(purchaseReturn.id);
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get Purchase Return by ID with items
const getPurchaseReturnById = async (req, res) => {
  try {
    const { id } = req.params;
    const pr = await getPurchaseReturnWithItems(id);

    if (!pr) {
      return commonService.notFound(res, "Purchase Return not found");
    }

    return commonService.okResponse(res, pr);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

const getPurchaseReturnWithItems = async (prId) => {
  try {
    // Get Purchase Return details
    const pr = await models.PurchaseReturn.findByPk(prId, {
      raw: true,
      nest: true
    });

    if (!pr) return null;

    // Get Purchase Return items with related data using raw queries
    const items = await sequelize.query(`
      SELECT 
        pri.id,
        pri.pr_id,
        pri.ref_no,
        pri.material_type_id,
        pri.category_id,
        pri.subcategory_id,
        pri.type,
        pri.purity,
        pri.material_price_per_gram,
        pri.quantity,
        pri.total_weight,
        pri.bag_weight,
        pri.gross_weight,
        pri.stone_weight,
        pri.others,
        pri.others_weight,
        pri.others_value,
        pri.net_weight,
        pri.purchase_rate,
        pri.stone_value,
        pri.making_charge,
        pri.rate_per_gram,
        pri.total_amount,
        mt.material_type as material_type_name,
        c.category_name as category_name,
        sc.subcategory_name as subcategory_name
      FROM purchase_return_items pri
      LEFT JOIN "materialTypes" mt ON pri.material_type_id = mt.id
      LEFT JOIN categories c ON pri.category_id = c.id
      LEFT JOIN subcategories sc ON pri.subcategory_id = sc.id
      WHERE pri.pr_id = :prId AND pri.deleted_at IS NULL
      ORDER BY pri.id ASC 
    `, {
      replacements: { prId },
      type: sequelize.QueryTypes.SELECT
    });

    // Get vendor details
    const vendor = await models.Vendor.findByPk(pr.vendor_id, {
      attributes: ['id', 'vendor_name'],
      raw: true
    }) || { id: pr.vendor_id, vendor_name: 'Vendor Not Found' };

    // Get user details if order_by_user_id exists
    let user = null;
    if (pr.order_by_user_id) {
      user = await models.User.findByPk(pr.order_by_user_id, {
        attributes: ['id', 'email'],
        raw: true
      });

      if (!user) {
        user = {
          id: pr.order_by_user_id,
          name: 'User Not Found'
        };
      }
    }

    // Get GRN details if grn_id exists
    let grn = null;
    if (pr.grn_id) {
      grn = await models.Grn.findByPk(pr.grn_id, {
        attributes: ['id', 'grn_no', 'grn_date'],
        raw: true
      });
    }

    // Get branch details (the selected branch's address is shown top-right on
    // the view/print, joined to district + state for the location lines).
    let branch = null;
    if (pr.branch_id) {
      const branchRows = await sequelize.query(`
        SELECT
          b.id,
          b.branch_name,
          b.address,
          b.mobile,
          b.gst_no,
          b.pin_code,
          d.district_name,
          s.state_name
        FROM branches b
        LEFT JOIN districts d ON d.id = b.district_id
        LEFT JOIN states s    ON s.id = b.state_id
        WHERE b.id = :branchId
        LIMIT 1
      `, {
        replacements: { branchId: pr.branch_id },
        type: sequelize.QueryTypes.SELECT
      });
      branch = branchRows[0] || null;
    }

    return {
      ...pr,
      vendor,
      order_by_user: user,
      grn,
      branch,
      items
    };
  } catch (error) {
    console.error('Error in getPurchaseReturnWithItems:', error);
    throw error;
  }
};

// Update Purchase Return 
const updatePurchaseReturn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], pr_no, ...updateData } = req.body || {};

    // ❌ Block PR number update
    if (pr_no !== undefined) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "Purchase Return number cannot be modified once created"
      );
    }

    // FIND PURCHASE RETURN
    const pr = await models.PurchaseReturn.findByPk(id, {
      transaction,});
    if (!pr) {
      await transaction.rollback();
      return commonService.notFound(res,"Purchase Return not found"
      );
    }

    // Update Purchase Return header fields
    await pr.update(updateData, { transaction });

    // DELETE OLD ITEMS
    await models.PurchaseReturnItem.destroy({
      where: { pr_id: id },
      force: true,
      transaction,
    });

    // CREATE NEW ITEMS
    for (const item of items) {

      const {
        id: _omitId,
        pr_id: _omitPrId,
        created_at,
        updated_at,
        deleted_at,
        ...itemData
      } = item;

      await models.PurchaseReturnItem.create(
        {
          ...itemData,
          pr_id: id,
        },
        { transaction }
      );
    }

    await transaction.commit();

    const result = await getPurchaseReturnWithItems(id);

    return commonService.okResponse(res, result);

  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};
// Delete Purchase Return (soft delete)
const deletePurchaseReturn = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const pr = await models.PurchaseReturn.findByPk(id, { transaction });

    if (!pr) {
      await transaction.rollback();
      return commonService.notFound(res, "Purchase Return not found");
    }

    // Soft delete Purchase Return and its items
    await Promise.all([
      pr.destroy({ transaction }),
      models.PurchaseReturnItem.destroy({
        where: { pr_id: id },
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

// List all Purchase Returns with pagination and filters (raw SQL, joins only)
const getAllPurchaseReturns = async (req, res) => {
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
    let whereSql = "WHERE pr.deleted_at IS NULL";
    const joinVendors = "LEFT JOIN vendors v ON v.id = pr.vendor_id";
    const replacements = { limit: parseInt(limit), offset };

    if (vendor_id) {
      whereSql += " AND pr.vendor_id = :vendor_id";
      replacements.vendor_id = vendor_id;
    }
    if (branch_id) {
      whereSql += " AND pr.branch_id = :branch_id";
      replacements.branch_id = branch_id;
    }
    if (start_date) {
      whereSql += " AND pr.pr_date >= :start_date";
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereSql += " AND pr.pr_date <= :end_date";
      replacements.end_date = end_date;
    }
    if (search) {
      whereSql += " AND (pr.pr_no ILIKE :search OR v.vendor_name ILIKE :search)";
      replacements.search = `%${search}%`;
    }

    // Count total rows (distinct Purchase Returns)
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT pr.id
        FROM purchase_returns pr
        ${joinVendors}
        ${whereSql}
        GROUP BY pr.id
      ) t;
    `;
    const [countRows] = await sequelize.query(countQuery, { replacements });
    const total = parseInt(countRows?.[0]?.total || 0, 10);

    // Data query with joins and aggregation
    const dataQuery = `
      SELECT 
        pr.id,
        pr.pr_no,
        pr.pr_date AS date,
        pr.status_id,
        pr.branch_id,
        b.branch_name,
        v.id as vendor_id,
        v.vendor_name,
        v.vendor_image_url,
        COALESCE(SUM(pri.quantity), 0) AS quantity,
        COALESCE(SUM(pri.net_weight), 0) AS weight,
        COALESCE(SUM(pri.total_amount), 0) AS total_amount,
        u.email_id as created_by
      FROM purchase_returns pr
      ${joinVendors}
      LEFT JOIN branches b ON b.id = pr.branch_id
      LEFT JOIN purchase_return_items pri ON pri.pr_id = pr.id AND pri.deleted_at IS NULL
      LEFT JOIN superadmin_profiles u ON u.id = pr.order_by_user_id
      ${whereSql}
      GROUP BY pr.id, b.branch_name, v.vendor_name, v.id, v.vendor_image_url, u.email_id
      ORDER BY pr.pr_no DESC
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

// GET: minimal list of Purchase Return numbers for dropdowns
const listPurchaseReturnNumbers = async (req, res) => {
  try {
    const rows = await models.PurchaseReturn.findAll({
      attributes: ["id", "pr_no"],
      order: [["created_at", "DESC"]],
    });

    return commonService.okResponse(res, { purchase_returns: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generatePurchaseReturnCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.PurchaseReturn,
      "pr_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { pr_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Detailed view for Purchase Return page (joins: vendor + location + item master names)
const getPurchaseReturnView = async (req, res) => {
  try {
    const { id } = req.params;

    // Header + vendor + location names
    const [headerRows] = await sequelize.query(`
        SELECT 
          pr.id,
          pr.pr_no,
          pr.pr_date,
          pr.reference_id,
          pr.subtotal_amount,
          pr.sgst_percent,
          pr.cgst_percent,
          pr.discount_percent,
          pr.remarks,
          pr.gst_no,
          pr.billing_address,
          pr.shipping_address,
          pr.branch_id,
          g.grn_no,
          g.grn_date,
          v.id               AS vendor_id,
          v.vendor_name,
          v.address          AS vendor_address,
          v.mobile           AS vendor_mobile,
          v.gst_no           AS vendor_gst_no,
          d.district_name    AS vendor_district,
          s.state_name       AS vendor_state,
          c.country_name     AS vendor_country
        FROM purchase_returns pr
        LEFT JOIN vendors v   ON v.id = pr.vendor_id
        LEFT JOIN grns g      ON g.id = pr.grn_id
        LEFT JOIN districts d ON d.id = v.district_id
        LEFT JOIN states s    ON s.id = v.state_id
        LEFT JOIN countries c ON c.id = v.country_id
        WHERE pr.id = :id
        LIMIT 1;
      `, { replacements: { id } });

    if (!headerRows || headerRows.length === 0) {
      return commonService.notFound(res, "Purchase Return not found");
    }

    // Items with material/category/subcategory names
    const [items] = await sequelize.query(`
        SELECT 
          pri.id,
          pri.ref_no,
          pri.type,
          pri.purity,
          pri.material_price_per_gram,
          pri.quantity,
          pri.total_weight,
          pri.bag_weight,
          pri.gross_weight,
          pri.stone_weight,
          pri.others,
          pri.others_weight,
          pri.others_value,
          pri.net_weight,
          pri.purchase_rate,
          pri.stone_value,
          pri.making_charge,
          pri.rate_per_gram,
          pri.total_amount,
          mt.material_type AS material_type_name,
          c.category_name AS category_name,
          sc.subcategory_name AS subcategory_name
        FROM purchase_return_items pri
        LEFT JOIN "materialTypes" mt ON pri.material_type_id = mt.id
        LEFT JOIN categories c ON pri.category_id = c.id
        LEFT JOIN subcategories sc ON pri.subcategory_id = sc.id
        WHERE pri.pr_id = :id AND pri.deleted_at IS NULL
        ORDER BY pri.id ASC;
      `, { replacements: { id } });

    // Totals (weights and amount)
    const [totalsRows] = await sequelize.query(`
        SELECT 
          COALESCE(SUM(pri.net_weight), 0) AS total_weight,
          COALESCE(SUM(pri.total_amount), 0) AS total_amount
        FROM purchase_return_items pri
        WHERE pri.pr_id = :id AND pri.deleted_at IS NULL;
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
  createPurchaseReturn,
  getPurchaseReturnById,
  updatePurchaseReturn,
  deletePurchaseReturn,
  getAllPurchaseReturns,
  listPurchaseReturnNumbers,
  generatePurchaseReturnCode,
  getPurchaseReturnView,
};

