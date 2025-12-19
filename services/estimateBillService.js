const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Generate estimate number (series)
const generateEstimateNo = async (req, res) => {
  try {
    const { prefix = "EST"} = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.EstimateBill,
      "estimate_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { estimate_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Create estimate (header + items)
const createEstimate = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { header = {}, items = [] } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(res, "At least one item is required");
    }
    // Totals
    let subtotal = 0;
    let totalQty = 0;
    const itemRows = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate || 0);
      const amount = Number(it.amount != null ? it.amount : qty * rate);
      subtotal += amount;
      totalQty += qty;
      return {
        product_id: it.product_id,
        product_item_detail_id: it.product_item_detail_id ?? null,
        hsn_code: it.hsn_code ?? null,
        product_name_snapshot: it.product_name_snapshot ?? null,
        purity_snapshot: it.purity_snapshot ?? null,
        quantity: qty,
        rate,
        amount,
        cgst_percent: it.cgst_percent ?? null,
        sgst_percent: it.sgst_percent ?? null,
        cgst_amount: it.cgst_amount ?? 0,
        sgst_amount: it.sgst_amount ?? 0,
      };
    });

    const cgstAmt = Number(header.cgst_amount ?? 0);
    const sgstAmt = Number(header.sgst_amount ?? 0);
    const total = subtotal + cgstAmt + sgstAmt;

    const bill = await models.EstimateBill.create(
      {
        estimate_no: header.estimate_no,
        estimate_date: header.estimate_date || new Date(),
        estimate_time: header.estimate_time || null,
        employee_id: header.employee_id || null,
        customer_id: header.customer_id || null,
        branch_id: header.branch_id || null,
        subtotal_amount: subtotal,
        cgst_percent: header.cgst_percent || null,
        sgst_percent: header.sgst_percent || null,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        total_amount: total, // addition of subtotal + cgst + sgst
        total_quantity: totalQty,
        status: header.status || "Printed",
      },
      { transaction: t }
    );

    const withFK = itemRows.map((row) => ({ ...row, estimate_bill_id: bill.id }));
    const createdItems = await models.EstimateBillItem.bulkCreate(withFK, { transaction: t, returning: true });

    await t.commit();
    return commonService.createdResponse(res, { estimate: bill, items: createdItems });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Get estimate by id
const getEstimateById = async (req, res) => {
  try {
    const id = req.params.id;
    const bill = await models.EstimateBill.findByPk(id);
    if (!bill) return commonService.notFound(res, enMessage.failure.notFound);
    const items = await models.EstimateBillItem.findAll({ where: { estimate_bill_id: id } });
    return commonService.okResponse(res, { estimate: bill, items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List estimates (simple filters)
const listEstimates = async (req, res) => {
  try {
    const { from, to, employee_id, customer_id, search, estimate_no } = req.query || {};

    // 1) Header rows with employee_no via join
    let sql = `
      SELECT 
        e.*,

        -- Employee
        emp.employee_no AS employee_no,
        emp.employee_name AS employee_name,

        -- Branch details
        b.branch_name AS branch_name,
        b.address AS branch_address,
        b.mobile AS branch_mobile_number,
        b.pin_code AS branch_pincode,
        b.gst_no AS branch_gst_no,
        bd.district_name AS branch_district_name,
        bs.state_name AS branch_state_name
      FROM estimate_bills e

      LEFT JOIN employees emp ON emp.id = e.employee_id AND emp.deleted_at IS NULL
      LEFT JOIN branches b ON b.id = e.branch_id AND b.deleted_at IS NULL
      LEFT JOIN districts bd ON bd.id = b.district_id
      LEFT JOIN states bs ON bs.id = b.state_id
      WHERE e.deleted_at IS NULL
    `;

    const replacements = {};
    if (from) { sql += ` AND e.estimate_date >= :from`; replacements.from = from; }
    if (to) { sql += ` AND e.estimate_date <= :to`; replacements.to = to; }
    if (employee_id) { sql += ` AND e.employee_id = :employee_id`; replacements.employee_id = employee_id; }
    if (customer_id) { sql += ` AND e.customer_id = :customer_id`; replacements.customer_id = customer_id; }
    if (estimate_no) { sql += ` AND e.estimate_no = :estimate_no`; replacements.estimate_no = estimate_no; }
    if (search) { sql += ` AND e.estimate_no ILIKE :search`; replacements.search = `%${search}%`; }
    sql += ` ORDER BY e.created_at DESC`;

    const [estimates] = await sequelize.query(sql, { replacements });

    // If no estimates, return early
    if (!estimates || estimates.length === 0) {
      return commonService.okResponse(res, { estimates: [] });
    }

    // 2) Fetch items for all returned estimates in one shot
    const estimateIds = estimates.map((e) => Number(e.id)).filter((v) => Number.isFinite(v));
    const idsList = estimateIds.length ? estimateIds.join(",") : "0"; // safe: ids come from DB
    const itemsSql = `
      SELECT 
        i.id,
        i.estimate_bill_id,
        i.product_id,
        i.product_item_detail_id,
        i.hsn_code,
        i.product_name_snapshot,
        i.quantity,
        i.rate,
        i.amount,
        i.created_at,
        i.updated_at
      FROM "estimate_bill_items" i
      WHERE i.deleted_at IS NULL
        AND i.estimate_bill_id IN (${idsList})
      ORDER BY i.estimate_bill_id ASC, i.id ASC
    `;

    const [items] = await sequelize.query(itemsSql);

    // 3) Group items by estimate_bill_id
    const itemsByEstimate = new Map();
    for (const it of items) {
      const k = it.estimate_bill_id;
      if (!itemsByEstimate.has(k)) itemsByEstimate.set(k, []);
      itemsByEstimate.get(k).push(it);
    }

    // 4) Attach items to each estimate
    const results = estimates.map((e) => ({
      ...e,
      items: itemsByEstimate.get(e.id) || [],
    }));

    return commonService.okResponse(res, { estimates: results });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteEstimate = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const bill = await models.EstimateBill.findByPk(id);
    if (!bill) { await t.rollback(); return commonService.notFound(res, enMessage.failure.notFound); }
    await models.EstimateBillItem.destroy({ where: { estimate_bill_id: id }, transaction: t });
    await bill.destroy({ transaction: t });
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

module.exports = {
  generateEstimateNo,
  createEstimate,
  getEstimateById,
  listEstimates,
  deleteEstimate,
};
