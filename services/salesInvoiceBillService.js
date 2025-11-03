const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Generate invoice number (series)
const generateSalesInvoiceNo = async (req, res) => {
  try {
    const { prefix = "INV", fy } = req.query || {};
    if (!fy) return commonService.badRequest(res, enMessage.failure.requiredFields);
    const code = await generateFiscalSeriesCode(
      models.SalesInvoiceBill,
      "invoice_no",
      String(prefix).toUpperCase(),
      { pad: 2, fyRange: fy }
    );
    return commonService.okResponse(res, { invoice_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Create Sales invoice (header + items)
const createSalesInvoice = async (req, res) => {
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
        discount_amount: it.discount_amount ?? 0,
        amount,
        cgst_percent: it.cgst_percent ?? null,
        sgst_percent: it.sgst_percent ?? null,
        cgst_amount: it.cgst_amount ?? 0,
        sgst_amount: it.sgst_amount ?? 0,
      };
    });

    const cgstAmt = Number(header.cgst_amount ?? 0);
    const sgstAmt = Number(header.sgst_amount ?? 0);
    const discountAmt = Number(header.discount_amount ?? 0);
    const total = subtotal - discountAmt + cgstAmt + sgstAmt;

    const bill = await models.SalesInvoiceBill.create(
      {
        invoice_no: header.invoice_no,
        invoice_date: header.invoice_date || new Date(),
        invoice_time: header.invoice_time || null,
        employee_id: header.employee_id,
        customer_id: header.customer_id || null,
        branch_id: header.branch_id || null,
        subtotal_amount: subtotal,
        cgst_percent: header.cgst_percent || null,
        sgst_percent: header.sgst_percent || null,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        discount_amount: discountAmt,
        total_amount: total,
        total_quantity: totalQty,
        status: header.status || "Draft",
      },
      { transaction: t }
    );

    const withFK = itemRows.map((row) => ({ ...row, invoice_bill_id: bill.id }));
    const createdItems = await models.SalesInvoiceBillItem.bulkCreate(withFK, { transaction: t, returning: true });

    await t.commit();
    return commonService.createdResponse(res, { invoice: bill, items: createdItems });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Get invoice by id
const getSalesInvoiceById = async (req, res) => {
  try {
    const id = req.params.id;
    const bill = await models.SalesInvoiceBill.findByPk(id);
    if (!bill) return commonService.notFound(res, enMessage.failure.notFound);
    const items = await models.SalesInvoiceBillItem.findAll({ where: { invoice_bill_id: id } });
    return commonService.okResponse(res, { invoice: bill, items });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List invoices (simple filters)
const listSalesInvoices = async (req, res) => {
  try {
    const { from, to, employee_id, customer_id, search } = req.query || {};

    let sql = `
      SELECT i.*
      FROM "sales_invoice_bills" i
      WHERE i.deleted_at IS NULL
    `;
    const replacements = {};
    if (from) { sql += ` AND i.invoice_date >= :from`; replacements.from = from; }
    if (to) { sql += ` AND i.invoice_date <= :to`; replacements.to = to; }
    if (employee_id) { sql += ` AND i.employee_id = :employee_id`; replacements.employee_id = employee_id; }
    if (customer_id) { sql += ` AND i.customer_id = :customer_id`; replacements.customer_id = customer_id; }
    if (search) { sql += ` AND i.invoice_no ILIKE :search`; replacements.search = `%${search}%`; }
    sql += ` ORDER BY i.created_at DESC`;

    const [rows] = await sequelize.query(sql, { replacements });
    return commonService.okResponse(res, { invoices: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete (soft)
const deleteSalesInvoice = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const bill = await models.SalesInvoiceBill.findByPk(id);
    if (!bill) { await t.rollback(); return commonService.notFound(res, enMessage.failure.notFound); }
    await models.SalesInvoiceBillItem.destroy({ where: { invoice_bill_id: id }, transaction: t });
    await bill.destroy({ transaction: t });
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

module.exports = {
  generateSalesInvoiceNo,
  createSalesInvoice,
  getSalesInvoiceById,
  listSalesInvoices,
  deleteSalesInvoice,
};
