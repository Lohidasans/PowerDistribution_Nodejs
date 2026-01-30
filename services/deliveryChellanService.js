const { models, sequelize } = require("../models/index");
const commonService = require("./commonService");
const message = require("../constants/en.json");
const { generateDeliveryChallanNoFunc } = require("../utils/commonfun");

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
        message.delivery_chellan?.required ||
          "delivery_challan_no, date, delivery_challan_type_id, vendor_id are required"
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(
        res,
        message.delivery_chellan_item?.arrayRequired ||
          "Items array required"
      );
    }

    for (const it of items) {
      if (!it.sku_id || !it.quantity || it.amount === undefined) {
        await t.rollback();
        return commonService.badRequest(
          res,
          message.delivery_chellan_item?.required ||
            "sku_id, quantity, amount are required in items"
        );
      }
    }

    /* ================= CHECK DUPLICATE ================= */

    const existing = await models.DeliveryChellan.findOne({
      where: { delivery_challan_no: payload.delivery_challan_no },
      paranoid: false, // include soft-deleted
      transaction: t,
    });

    let deliveryChellan;

    if (existing) {
      if (existing.deleted_at) {
        // 🔁 Restore soft-deleted record
        await existing.restore({ transaction: t });
        await existing.update(payload, { transaction: t });
        deliveryChellan = existing;
      } else {
        // ❌ Active duplicate
        await t.rollback();
        return commonService.badRequest(
          res,
          "delivery_challan_no already exists"
        );
      }
    } else {
      // ✅ Create new header
      deliveryChellan = await models.DeliveryChellan.create(payload, {
        transaction: t,
      });
    }

    /* ================= ITEMS ================= */

    // Remove old items (if restored)
    await models.DeliveryChellanItem.destroy({
      where: { delivery_chellan_id: deliveryChellan.id },
      transaction: t,
    });

    const itemsToCreate = items.map((it) => ({
      delivery_chellan_id: deliveryChellan.id,
      sku_id: it.sku_id,
      product_description: it.product_description || null,
      quantity: it.quantity,
      weight: it.weight ?? null,
      amount: it.amount,
    }));

    const createdItems = await models.DeliveryChellanItem.bulkCreate(
      itemsToCreate,
      { returning: true, transaction: t }
    );

    await t.commit();

    return commonService.createdResponse(res, {
      delivery_chellan: deliveryChellan,
      items: createdItems,
    });
  } catch (err) {
    await t.rollback();

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
    const { search, vendor_id, delivery_challan_type_id, date_from, date_to } =
      req.query;

    // 1) get headers
    let query = `
      SELECT
        dc.*
      FROM delivery_chellan dc
      WHERE dc.deleted_at IS NULL
    `;
    const replacements = {};

    if (vendor_id) {
      query += ` AND dc.vendor_id = :vendor_id`;
      replacements.vendor_id = vendor_id;
    }
    if (delivery_challan_type_id) {
      query += ` AND dc.delivery_challan_type_id = :delivery_challan_type_id`;
      replacements.delivery_challan_type_id = delivery_challan_type_id;
    }
    if (date_from) {
      query += ` AND dc.date >= :date_from`;
      replacements.date_from = date_from;
    }
    if (date_to) {
      query += ` AND dc.date <= :date_to`;
      replacements.date_to = date_to;
    }

    if (search) {
      const fields = ["dc.delivery_challan_no", "dc.ref_no"];
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
  const entity = await commonService.findById(
    models.DeliveryChellan,
    req.params.id,
    res
  );
  if (!entity) return;

  return commonService.okResponse(res, { delivery_chellan: entity });
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

    // update header
    await entity.update(payload, { transaction: t });

    let updatedItems = null;

    // if items provided, replace existing items
    if (items !== undefined) {
      if (!Array.isArray(items)) {
        await t.rollback();
        return commonService.badRequest(res, "Items must be an array");
      }

      // validate items (optional)
      for (const it of items) {
        if (!it.sku_id || !it.quantity || it.amount === undefined) {
          await t.rollback();
          return commonService.badRequest(
            res,
            "sku_id, quantity, amount are required in items"
          );
        }
      }

      // soft delete existing items (paranoid destroy)
      await models.DeliveryChellanItem.destroy({
        where: { delivery_chellan_id: entity.id },
        transaction: t,
      });

      // recreate new items
      const itemsToCreate = items.map((it) => ({
        delivery_chellan_id: entity.id,
        sku_id: it.sku_id,
        product_description: it.product_description || null,
        quantity: it.quantity,
        weight: it.weight ?? null,
        amount: it.amount,
      }));

      updatedItems = await models.DeliveryChellanItem.bulkCreate(itemsToCreate, {
        returning: true,
        transaction: t,
      });
    }

    await t.commit();

    return commonService.okResponse(res, {
      delivery_chellan: entity,
      items: updatedItems, // null if items not sent
    });
  } catch (err) {
    await t.rollback();
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
    const { items, ...payload } = req.body;

    // update header
    await entity.update(payload, { transaction: t });

   
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
