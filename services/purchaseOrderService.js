const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create Purchase Order
const createPurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { items = [], ...header } = req.body || {};

    // Basic validation
    const required = ["po_no", "po_date", "vendor_id"];
    for (const f of required) {
      if (!header[f]) {
        await t.rollback();
        return commonService.badRequest(res, `${f} is required`);
      }
    }
    if (header.po_no) {
      const existing = await models.PurchaseOrder.findOne({
        where: {
          po_no: header.po_no,
          deleted_at: null,     // only check active (non-deleted) records
        },
      });

      if (existing) {
        await t.rollback();
        return commonService.badRequest(res, {
          message: "Purchase order number already exists",
        });
      }
    }

    const po = await models.PurchaseOrder.create(header, { transaction: t });

    if (Array.isArray(items) && items.length > 0) {
      const rows = items.map((it) => ({ ...it, po_id: po.id }));
      await models.PurchaseOrderItem.bulkCreate(rows, { transaction: t });
    }

    await t.commit();
    const result = await getPOWithItems(po.id);
    return commonService.createdResponse(res, result);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Helper: fetch PO with items via raw joins to master names
const getPOWithItems = async (poId) => {
  const po = await models.PurchaseOrder.findByPk(poId, { raw: true });
  if (!po) return null;

  const items = await sequelize.query(
    `SELECT 
       poi.*, 
       mt.material_type   AS material_type_name,
       c.category_name    AS category_name,
       sc.subcategory_name AS subcategory_name
     FROM purchase_order_items poi
     LEFT JOIN "materialTypes" mt ON poi.material_type_id = mt.id
     LEFT JOIN categories c       ON poi.category_id = c.id
     LEFT JOIN subcategories sc   ON poi.subcategory_id = sc.id
     WHERE poi.po_id = :id AND poi.deleted_at IS NULL
     ORDER BY poi.id ASC`,
    { replacements: { id: poId }, type: sequelize.QueryTypes.SELECT }
  );

  return { ...po, items };
};

// Get PO by ID
const getPurchaseOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getPOWithItems(id);
    if (!data) return commonService.notFound(res, "Purchase Order not found");
    return commonService.okResponse(res, data);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update PO (header + update items by id only)
const updatePurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { items = [], ...updateData } = req.body || {};

    const po = await models.PurchaseOrder.findByPk(id, { transaction: t });
    if (!po) {
      await t.rollback();
      return commonService.notFound(res, "Purchase Order not found");
    }

    await po.update(updateData, { transaction: t });

    for (const item of items) {
      if (item && item.id) {
        const existing = await models.PurchaseOrderItem.findOne({
          where: { id: item.id, po_id: id },
          transaction: t,
        });
        if (existing) {
          const { id: _i, po_id: _p, created_at, updated_at, deleted_at, ...updatable } = item;
          await existing.update(updatable, { transaction: t });
        }
      }
    }

    await t.commit();
    const result = await getPOWithItems(id);
    return commonService.okResponse(res, result);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Delete PO (soft) and its items
const deletePurchaseOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const po = await models.PurchaseOrder.findByPk(id, { transaction: t });
    if (!po) {
      await t.rollback();
      return commonService.notFound(res, "Purchase Order not found");
    }
    await Promise.all([
      po.destroy({ transaction: t }),
      models.PurchaseOrderItem.destroy({ where: { po_id: id }, transaction: t }),
    ]);
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// List POs with pagination and filters (raw SQL)
const listPurchaseOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, vendor_id, start_date, end_date, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereSql = "WHERE p.deleted_at IS NULL";
    const replacements = { limit: parseInt(limit), offset };

    if (vendor_id) { whereSql += " AND p.vendor_id = :vendor_id"; replacements.vendor_id = vendor_id; }
    if (start_date) { whereSql += " AND p.po_date >= :start_date"; replacements.start_date = start_date; }
    if (end_date) { whereSql += " AND p.po_date <= :end_date"; replacements.end_date = end_date; }
    if (search) { whereSql += " AND (p.po_no ILIKE :search OR v.vendor_name ILIKE :search)"; replacements.search = `%${search}%`; }

    const joinVendors = "LEFT JOIN vendors v ON v.id = p.vendor_id";

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT p.id
        FROM purchase_orders p
        ${joinVendors}
        ${whereSql}
        GROUP BY p.id
      ) t;
    `;
    const [countRows] = await sequelize.query(countQuery, { replacements });
    const total = parseInt(countRows?.[0]?.total || 0, 10);

    const dataQuery = `
      SELECT 
        p.id,
        p.po_no,
        p.po_date AS date,
        p.status_id,
        v.id AS vendor_id,
        v.vendor_name,
        v.vendor_image_url,
        u.email as created_by,
        COALESCE(SUM(poi.ordered_weight), 0) AS ordered_weight
      FROM purchase_orders p
      ${joinVendors}
      LEFT JOIN purchase_order_items poi ON poi.po_id = p.id AND poi.deleted_at IS NULL
      LEFT JOIN users u ON u.id = p.order_by_user_id
      ${whereSql}
      GROUP BY p.id, v.vendor_name, v.id, v.vendor_image_url, u.email
      ORDER BY p.po_date DESC, p.id DESC
      LIMIT :limit OFFSET :offset;
    `;
    const [rows] = await sequelize.query(dataQuery, { replacements });

    return commonService.okResponse(res, {
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: rows,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Detailed view (header + vendor address names + items)
const getPurchaseOrderView = async (req, res) => {
  try {
    const { id } = req.params;
    const [headerRows] = await sequelize.query(
      `SELECT 
         p.id,
         p.po_no,
         p.po_date,
         p.subtotal_amount,
         p.sgst_percent,
         p.cgst_percent,
         p.discount_percent,
         p.remarks,
         p.gst_no,
         p.billing_address,
         p.shipping_address,
         v.id AS vendor_id,
         v.vendor_name,
         v.address AS vendor_address,
         v.mobile AS vendor_mobile,
         v.gst_no AS vendor_gst_no,
         d.district_name AS vendor_district,
         s.state_name AS vendor_state,
         c.country_name AS vendor_country
       FROM purchase_orders p
       LEFT JOIN vendors v   ON v.id = p.vendor_id
       LEFT JOIN districts d ON d.id = v.district_id
       LEFT JOIN states s    ON s.id = v.state_id
       LEFT JOIN countries c ON c.id = v.country_id
       WHERE p.id = :id
       LIMIT 1;`,
      { replacements: { id } }
    );

    if (!headerRows || headerRows.length === 0) {
      return commonService.notFound(res, "Purchase Order not found");
    }

    const [items] = await sequelize.query(
      `SELECT 
         poi.id,
         poi.description,
         poi.purity,
         poi.ordered_weight,
         poi.quantity,
         poi.rate,
         poi.amount,
         mt.material_type AS material_type_name,
         c.category_name AS category_name,
         sc.subcategory_name AS subcategory_name
       FROM purchase_order_items poi
       LEFT JOIN "materialTypes" mt ON poi.material_type_id = mt.id
       LEFT JOIN categories c       ON poi.category_id = c.id
       LEFT JOIN subcategories sc   ON poi.subcategory_id = sc.id
       WHERE poi.po_id = :id AND poi.deleted_at IS NULL
       ORDER BY poi.id ASC;`,
      { replacements: { id } }
    );

    const [totalsRows] = await sequelize.query(
      `SELECT 
         COALESCE(SUM(poi.ordered_weight), 0) AS total_ordered_weight,
         COALESCE(SUM(poi.amount), 0)         AS total_amount
       FROM purchase_order_items poi
       WHERE poi.po_id = :id AND poi.deleted_at IS NULL;`,
      { replacements: { id } }
    );

    return commonService.okResponse(res, {
      header: headerRows[0],
      items,
      totals: totalsRows[0],
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Minimal dropdown list
const listPurchaseOrderNumbers = async (req, res) => {
  try {
    const rows = await models.PurchaseOrder.findAll({
      attributes: ["id", "po_no", "po_date"],
      order: [["created_at", "DESC"]],
    });
    return commonService.okResponse(res, { purchase_orders: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Generate PO code
const generatePoCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.PurchaseOrder,
      "po_no",
      String(prefix).toUpperCase(),
      { pad: 3}
    );
    return commonService.okResponse(res, { po_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createPurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderView,
  listPurchaseOrderNumbers,
  generatePoCode,
};


