const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateDeliveryChallanNoFunc } = require("../utils/commonfun");
const { reduceDeliveryChallanStock, restoreDeliveryChallanStock }= require("../helpers/deliveryChellanHelper");

const createDeliveryChellan = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { items = [], ...payload } = req.body;

    /* ================= VALIDATION ================= */

    if (
      !payload.delivery_challan_no ||
      !payload.date ||
      !payload.delivery_challan_type_id ||
      !payload.vendor_id
    ) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "delivery_challan_no, date, delivery_challan_type_id and vendor_id are required"
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "Items array is required"
      );
    }

    for (const item of items) {
      if (!item.product_id ||!item.product_item_id || !item.sku_id || !item.quantity || item.amount === undefined) {
        await t.rollback();
        return commonService.badRequest(
          res,
          "product_id, product_item_id, sku_id, quantity and amount are required"
        );
      }
    }

    /* ================= DUPLICATE CHECK ================= */

    const existing = await models.DeliveryChellan.findOne({
      where: { delivery_challan_no: payload.delivery_challan_no,},
      paranoid: false,
      transaction: t,
    });

    let deliveryChellan;

    if (existing) {
      if (existing.deleted_at) {
        await existing.restore({ transaction: t });
        await existing.update(payload, { transaction: t,});
        deliveryChellan = existing;
      } else {
        await t.rollback();
        return commonService.badRequest(
          res,
          "delivery_challan_no already exists"
        );
      }
    } else {
      deliveryChellan = await models.DeliveryChellan.create(payload, {
          transaction: t,
        });
    }

    /* ================= STOCK VALIDATION & REDUCTION ================= */

    const itemsToCreate = [];

    for (const item of items) {
      await reduceDeliveryChallanStock(item.product_item_id, item.quantity, deliveryChellan.id, t );

      itemsToCreate.push({
        delivery_chellan_id: deliveryChellan.id,

        product_id: item.product_id,
        product_item_id: item.product_item_id,

        sku_id: item.sku_id,
        product_description:
          item.product_description || null,

        quantity: item.quantity,
        weight: item.weight || 0,
        amount: item.amount,
      });
    }

    const createdItems = await models.DeliveryChellanItem.bulkCreate(
        itemsToCreate,
        { returning: true, transaction: t,}
      );

    await t.commit();

    return commonService.createdResponse(res, {
      delivery_chellan: deliveryChellan,
      items: createdItems,
    });
  } catch (err) {
    await t.rollback();

    console.error(err);
     // ✅ Clean unique constraint message
    if (err?.name === "SequelizeUniqueConstraintError") {
      return commonService.badRequest(
        res,
        "delivery_challan_no already exists"
      );
    }

    return commonService.handleError(res, err);
  }
};

const getAllDeliveryChellans = async (req, res) => {
  try {
    const { search, vendor_id, date, status_id, delivery_challan_type_id, date_from, date_to, branch_id } =
      req.query;

    // 1) get headers with vendor details
    let query = `
      SELECT
        dc.*,
        v.vendor_name,
        v.email as vendor_email,
        v.mobile as vendor_mobile,
        v.gst_no as vendor_gst_no,
        v.address as vendor_address,
        CASE 
          WHEN dc.delivery_challan_type_id = 1 THEN 'Job Work'
          WHEN dc.delivery_challan_type_id = 2 THEN 'Others'
          ELSE NULL
        END as delivery_challan_type,
        CASE 
          WHEN dc.status_id = 1 THEN 'Issued'
          WHEN dc.status_id = 2 THEN 'Closed'
          ELSE NULL
        END as status
      FROM delivery_chellan dc
      LEFT JOIN vendors v ON dc.vendor_id = v.id
      WHERE dc.deleted_at IS NULL
    `;
    const replacements = {};

    if (vendor_id) {
      query += ` AND dc.vendor_id = :vendor_id`;
      replacements.vendor_id = vendor_id;
    }
    if (branch_id) {
      query += ` AND dc.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }
    if (status_id) {
      query += ` AND dc.status_id = :status_id`;
      replacements.status_id = status_id;
    }
    if (delivery_challan_type_id) {
      query += ` AND dc.delivery_challan_type_id = :delivery_challan_type_id`;
      replacements.delivery_challan_type_id = delivery_challan_type_id;
    }
    if (date) {
      query += ` AND DATE(dc.date) = :date`;
      replacements.date = date;
    } else {
      if (date_from) {
        query += ` AND dc.date >= :date_from`;
        replacements.date_from = date_from;
      }
      if (date_to) {
        query += ` AND dc.date <= :date_to`;
        replacements.date_to = date_to;
      }
    }

    if (search) {
      const fields = ["dc.delivery_challan_no", "dc.ref_no", "v.vendor_name"];
      query += ` AND (${fields
        .map((f) => `${f} ILIKE :search`)
        .join(" OR ")})`;
      replacements.search = `%${search}%`;
    }

    query += ` ORDER BY dc.date DESC, dc.id DESC`;

    const [headers] = await sequelize.query(query, { replacements });

    if (!headers || headers.length === 0) {
      return commonService.okResponse(res, { delivery_chellans: [] });
    }

    // 2) get items for these headers
    const headerIds = headers.map((h) => h.id);

    const items = await models.DeliveryChellanItem.findAll({
      where: {
        delivery_chellan_id: headerIds,
        deleted_at: null,
      },
      order: [["id", "ASC"]],
      raw: true,
    });

    // 3) group items by header id
    const map = {};
    for (const it of items) {
      if (!map[it.delivery_chellan_id]) map[it.delivery_chellan_id] = [];
      map[it.delivery_chellan_id].push(it);
    }

    const delivery_chellans = headers.map((h) => ({
      ...h,
      vendor: {
        vendor_name: h.vendor_name,
        email: h.vendor_email,
        mobile: h.vendor_mobile,
        gst_no: h.vendor_gst_no,
        address: h.vendor_address,
      },
      items: map[h.id] || [],
    }));

    return commonService.okResponse(res, { delivery_chellans });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


const listDeliveryChellansDropdown = async (req, res) => {
  try {
    const { vendor_id } = req.query;

    const where = { deleted_at: null };
    if (vendor_id) where.vendor_id = vendor_id;

    const delivery_chellans = await models.DeliveryChellan.findAll({
      attributes: ["id", "delivery_challan_no", "date"],
      where,
      order: [
        ["date", "DESC"],
        ["delivery_challan_no", "DESC"],
      ],
    });

    return commonService.okResponse(res, { delivery_chellans });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getDeliveryChellanById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        dc.*,
        v.vendor_name,
        v.email as vendor_email,
        v.mobile as vendor_mobile,
        v.gst_no as vendor_gst_no,
        v.address as vendor_address,
        b.gst_no as branch_gst_no,
        b.branch_name,
        CASE 
          WHEN dc.delivery_challan_type_id = 1 THEN 'Job Work'
          WHEN dc.delivery_challan_type_id = 2 THEN 'Others'
          ELSE NULL
        END as delivery_challan_type,
        CASE 
          WHEN dc.status_id = 1 THEN 'Issued'
          WHEN dc.status_id = 2 THEN 'Closed'
          ELSE NULL
        END as status
      FROM delivery_chellan dc
      LEFT JOIN vendors v ON dc.vendor_id = v.id
      LEFT JOIN branches b ON dc.branch_id = b.id
      WHERE dc.id = :id AND dc.deleted_at IS NULL
    `;

    const [results] = await sequelize.query(query, {
      replacements: { id },
    });

    if (!results || results.length === 0) {
      return commonService.notFound(res, "Delivery Chellan not found");
    }

    const header = results[0];

    // Get items
    const items = await models.DeliveryChellanItem.findAll({
      where: {
        delivery_chellan_id: id,
        deleted_at: null,
      },
      order: [["id", "ASC"]],
      raw: true,
    });

    const delivery_chellan = {
      ...header,
      vendor: {
        vendor_name: header.vendor_name,
        email: header.vendor_email,
        mobile: header.vendor_mobile,
        gst_no: header.vendor_gst_no,
        address: header.vendor_address,
      },
      branch: {
        gst_no: header.branch_gst_no,
        branch_name: header.branch_name,
      },
      items,
    };

    return commonService.okResponse(res, { delivery_chellan });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateDeliveryChellan = async (req, res) => {
  const entity = await commonService.findById(
    models.DeliveryChellan,
    req.params.id,
    res
  );

  if (!entity) return;

  const t = await sequelize.transaction();

  try {
    const { items, ...payload } = req.body;

    /* ================= UPDATE HEADER ================= */

    await entity.update(payload, {
      transaction: t,
    });

    let updatedItems = null;

    if (items !== undefined) {
      if (!Array.isArray(items)) {
        await t.rollback();

        return commonService.badRequest(
          res,
          "Items must be an array"
        );
      } 

      const oldItems =
        await models.DeliveryChellanItem.findAll({
          where: {
            delivery_chellan_id: entity.id,
          },
          transaction: t,
        });

      /* ================= RESTORE OLD STOCK ================= */
      for (const oldItem of oldItems) {
        await restoreDeliveryChallanStock(
          oldItem.product_item_id,
          oldItem.quantity,
          t
        );
      }
    
      /* ================= DELETE OLD ITEMS ================= */

      await models.DeliveryChellanItem.destroy({
        where: {
          delivery_chellan_id: entity.id,
        },
        transaction: t,
      });

      /* ================= CREATE NEW ITEMS ================= */

      const itemsToCreate = [];

      for (const item of items) {
        if (!item.product_id || !item.product_item_id || !item.sku_id || !item.quantity || item.amount === undefined) {
          throw new Error("product_id, product_item_id, sku_id, quantity and amount are required");
        }

        await reduceDeliveryChallanStock(item.product_item_id, item.quantity, entity.id, t);

        itemsToCreate.push({
          delivery_chellan_id: entity.id,
          product_id: item.product_id,
          product_item_id: item.product_item_id,
          sku_id: item.sku_id,
          product_description: item.product_description || null,
          quantity: item.quantity,
          weight: item.weight || 0,
          amount: item.amount,
        });
      }

      updatedItems =
        await models.DeliveryChellanItem.bulkCreate(
          itemsToCreate,
          {
            returning: true,
            transaction: t,
          }
        );
    }

    await t.commit();

    return commonService.okResponse(res, {
      delivery_chellan: entity,
      items: updatedItems,
    });
  } catch (err) {
    await t.rollback();

    console.error(err);

    return commonService.handleError(res, err);
  }
};

const updateDeliveryChellanClose = async (req, res) => {
  const entity = await commonService.findById(
    models.DeliveryChellan,
    req.params.id,
    res
  );
  if (!entity) return;

  const t = await sequelize.transaction();
  try {
    const { status_id } = req.body;

    // update only status_id
    await entity.update({ status_id }, { transaction: t });

   
    await t.commit();

    return commonService.okResponse(res, {
      delivery_chellan: entity,
    
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const deleteDeliveryChellan = async (req, res) => {
  const entity = await commonService.findById(
    models.DeliveryChellan,
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

const deleteDeliveryChellanItem = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await commonService.findById(
      models.DeliveryChellanItem,
      id,
      res
    );
    if (!item) return;

    await item.destroy(); // soft delete (paranoid)
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const generateDeliveryChallanNo = async (req, res) => {
  try {
    const code = await generateDeliveryChallanNoFunc();
    return commonService.okResponse(res, {
      delivery_challan_no: code,
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createDeliveryChellan,
  getAllDeliveryChellans,
  listDeliveryChellansDropdown,
  getDeliveryChellanById,
  deleteDeliveryChellanItem,
  updateDeliveryChellan,
  deleteDeliveryChellan,
  generateDeliveryChallanNo,
  updateDeliveryChellanClose
};
