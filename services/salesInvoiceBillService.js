const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { ValidationError } = require("../utils/errors");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { validateProductItemDetails,
  validateDuplicateUniqueCode,
  validateProducts,
  reduceStockForInvoice,
  validateCashPayment,
  lockBillAdjustmentFlags,
  unlockBillAdjustmentFlags,
  validateInvoiceItems,
  validateEstimateForInvoice,
  restoreStockForInvoice,
  markEstimateAsConverted } = require('../helpers/billingValidations');
const { calculateItemsAndSubtotal, calculateInvoiceTotals, calculatePaymentSummary } = require("../helpers/billingCalculations");
const { buildInvoiceGstSnapshot } = require("../helpers/gstClassification");
const { Op } = require("sequelize");
const ExcelJS = require("exceljs");
const {sendCustomerNotification,} = require("../helpers/notificationHelper");
const notificationMessages = require("../constants/notificationMessages");

// Generate invoice number (series)
const generateSalesInvoiceNo = async (req, res) => {
  try {
    const { prefix = "INV" } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.SalesInvoiceBill,
      "invoice_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { invoice_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get a single sales invoice by ID with related data
const getSalesInvoiceById = async (req, res) => {
  try {
    const id = req.params.id;

    // Get the main invoice
    const invoice = await commonService.findById(models.SalesInvoiceBill, id, res);
    if (!invoice) return;

    // Get related data in parallel
    const [items, payment, adjustments, customer, branch] = await Promise.all([
      // Get invoice items
      models.SalesInvoiceBillItem.findAll({
        where: { invoice_bill_id: id },
        raw: true
      }),

      // Get payment details
      models.Payment.findAll({
        where: { invoice_bill_id: id },
        raw: true
      }),

      // Adjustments
      models.SalesInvoiceAdjustment.findAll({
        where: { sales_invoice_id: id },
        raw: true
      }),

      // Get customer details
      models.Customer.findByPk(invoice.customer_id, {
        attributes: ['customer_name', 'address', 'mobile_number', 'pin_code', 'pan_no'],
        raw: true
      }),

      // Get branch details
      models.Branch.findByPk(invoice.branch_id, {
        attributes: ['branch_name', 'address', 'mobile', 'pin_code', 'gst_no'],
        raw: true
      })
    ]);

    // Format the response
    const response = {
      invoice: {
        ...invoice.get({ plain: true })
      },
      customer: customer || null,
      branch: branch || null,
      payment: payment || [],
      adjustments: adjustments || [],
      items: items || []
    };

    return commonService.okResponse(res, response);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List invoices - bill page/ customer - order details page
const listSalesInvoices = async (req, res) => {
  try {
    const {
      from, to, invoice_no, date, employee_id, customer_id,
      branch_id, order_type, search, status,
      page, limit = 20
    } = req.query || {};

    // Pagination is optional (send ?page=1&limit=20). Without it, all rows are
    // returned – but via cheap batched joins instead of per-row subqueries.
    const hasPagination = page !== undefined;
    const offset = hasPagination
      ? (parseInt(page) - 1) * parseInt(limit)
      : null;

    // ---------- Shared WHERE (used by both count + data queries) ----------
    let where = `WHERE i.deleted_at IS NULL`;
    const replacements = {};

    if (from) { where += ` AND i.invoice_date >= :from`; replacements.from = from; }
    if (to) { where += ` AND i.invoice_date <= :to`; replacements.to = to; }
    if (date) { where += ` AND DATE(i.invoice_date) = :date`; replacements.date = date; }
    if (employee_id) { where += ` AND i.employee_id = :employee_id`; replacements.employee_id = employee_id; }
    if (invoice_no) { where += ` AND i.invoice_no = :invoice_no`; replacements.invoice_no = invoice_no; }
    if (customer_id) { where += ` AND i.customer_id = :customer_id`; replacements.customer_id = customer_id; }
    if (branch_id) { where += ` AND i.branch_id = :branch_id`; replacements.branch_id = branch_id; }
    if (order_type) { where += ` AND i.order_type = :order_type`; replacements.order_type = order_type; }
    if (status) { where += ` AND i.status = :status`; replacements.status = status; }

    if (search) {
      where += ` AND (
        i.invoice_no ILIKE :search OR
        c.customer_name ILIKE :search OR
        b.branch_name ILIKE :search OR
        EXISTS (
          SELECT 1
          FROM sales_invoice_bill_items sii
          WHERE sii.invoice_bill_id = i.id
            AND sii.product_name_snapshot ILIKE :search
            AND sii.deleted_at IS NULL
        )
      )`;
      replacements.search = `%${search}%`;
    }

    // ---------- Total count (lightweight – no child aggregation) ----------
    const [{ total }] = await sequelize.query(`
      SELECT COUNT(*)::int AS total
      FROM sales_invoice_bills i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN branches b ON b.id = i.branch_id
      ${where}
    `, { replacements, type: sequelize.QueryTypes.SELECT });

    // ---------- Header rows only (no correlated subqueries / no giant CTE) ----------
    let dataQuery = `
      SELECT
        i.*,
        e.employee_name AS sales_person_name,
        e.employee_no AS sales_person_code,

        -- Customer details
        c.customer_name,
        c.address AS customer_address,
        c.mobile_number AS customer_mobile_number,
        c.pin_code AS customer_pincode,
        c.pan_no AS customer_pan_no,
        c.gst_no AS customer_gst_no,
        ct.country_name AS customer_country_name,
        d.district_name AS customer_district_name,
        s.state_name AS customer_state_name,

        -- Branch details
        b.branch_name,
        b.address AS branch_address,
        b.mobile AS branch_mobile_number,
        b.pin_code AS branch_pincode,
        b.gst_no AS branch_gst_no,
        bd.district_name AS branch_district_name,
        bs.state_name AS branch_state_name

      FROM sales_invoice_bills i
      LEFT JOIN employees e ON e.id = i.employee_id

      -- Customer joins
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN districts d ON d.id = c.district_id
      LEFT JOIN states s ON s.id = c.state_id
      LEFT JOIN countries ct ON ct.id = c.country_id

      -- Branch joins
      LEFT JOIN branches b ON b.id = i.branch_id
      LEFT JOIN districts bd ON bd.id = b.district_id
      LEFT JOIN states bs ON bs.id = b.state_id

      ${where}
      ORDER BY i.created_at DESC
    `;

    if (hasPagination) {
      dataQuery += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = parseInt(limit);
      replacements.offset = offset;
    }

    const invoices = await sequelize.query(dataQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const invoiceIds = invoices.map(inv => inv.id);

    // ---------- Fetch children only for this page (batched IN queries) ----------
    let itemsMap = {}, adjustmentsMap = {}, paymentsMap = {};

    if (invoiceIds.length) {
      const [items, adjustments, payments] = await Promise.all([
        // Line items + live stock (remaining_quantity) + SKUs
        sequelize.query(`
          SELECT
            sii.*,
            pid.sku_id AS product_item_sku_id,
            pid.quantity AS remaining_quantity,
            p.sku_id AS product_sku_id
          FROM sales_invoice_bill_items sii
          LEFT JOIN "productItemDetails" pid ON pid.id = sii.product_item_detail_id
          LEFT JOIN products p ON p.id = pid.product_id
          WHERE sii.invoice_bill_id IN (:ids)
            AND sii.deleted_at IS NULL
          ORDER BY sii.invoice_bill_id, sii.id ASC
        `, { replacements: { ids: invoiceIds }, type: sequelize.QueryTypes.SELECT }),

        // Adjustments
        sequelize.query(`
          SELECT
            a.id, a.sales_invoice_id, a.adjustment_type_id,
            bat.type_name AS adjustment_type_name,
            a.reference_id, a.reference_no, a.adjustment_amount,
            a.created_at, a.updated_at
          FROM sales_invoice_adjustments a
          LEFT JOIN bill_adjustment_types bat ON bat.id = a.adjustment_type_id::integer
          WHERE a.sales_invoice_id IN (:ids)
            AND a.deleted_at IS NULL
          ORDER BY a.sales_invoice_id, a.created_at DESC
        `, { replacements: { ids: invoiceIds }, type: sequelize.QueryTypes.SELECT }),

        // Payments
        sequelize.query(`
          SELECT
            p.id, p.invoice_bill_id, p.payment_mode, p.amount_received,
            p.payment_date, p.transaction_id, p.status,
            p.created_at, p.updated_at
          FROM payments p
          WHERE p.invoice_bill_id IN (:ids)
            AND p.deleted_at IS NULL
          ORDER BY p.invoice_bill_id, p.created_at DESC
        `, { replacements: { ids: invoiceIds }, type: sequelize.QueryTypes.SELECT })
      ]);

      items.forEach(it => { (itemsMap[it.invoice_bill_id] ??= []).push(it); });
      adjustments.forEach(a => { (adjustmentsMap[a.sales_invoice_id] ??= []).push(a); });
      payments.forEach(p => { (paymentsMap[p.invoice_bill_id] ??= []).push(p); });
    }

    // ---------- Format the response (same shape as before) ----------
    const formattedInvoices = invoices.map(invoice => {
      const invoiceItems = itemsMap[invoice.id] || [];
      const billAdjustments = adjustmentsMap[invoice.id] || [];
      const paymentDetails = paymentsMap[invoice.id] || [];

      // Parse numeric fields safely
      const subtotal = parseFloat(invoice.subtotal_amount || 0);
      const cgst = parseFloat(invoice.cgst_amount || 0);
      const sgst = parseFloat(invoice.sgst_amount || 0);
      const igst = parseFloat(invoice.igst_amount || 0);

      const totalAfterAdjustment = parseFloat(invoice.total_amount || 0);
      const totalAdjustment = billAdjustments.reduce(
        (sum, a) => sum + parseFloat(a.adjustment_amount || 0), 0);
      const totalPaid = paymentDetails.reduce(
        (sum, p) => sum + parseFloat(p.amount_received || 0), 0);

      // ✅ Correct total before discount (matches CREATE logic)
      const totalBeforeAdjustment = subtotal + cgst + sgst + igst;

      // Amount due (can be negative → refund)
      const amountDue = totalAfterAdjustment - totalPaid;

      const totalItemsQuantity = invoiceItems.reduce(
        (sum, it) => sum + (parseInt(it.quantity) || 0), 0);
      const totalItemsAmount = invoiceItems.reduce(
        (sum, it) => sum + (parseFloat(it.amount) || 0), 0);

      return {
        ...invoice,

        // ✅ Totals
        total_amount_before_adjustment: totalBeforeAdjustment.toFixed(2),
        total_amount_after_adjustment: totalAfterAdjustment.toFixed(2),
        total_adjustment_amount: totalAdjustment,
        total_paid_amount: totalPaid.toFixed(2),
        amount_due: amountDue.toFixed(2),

        // Line items with remaining stock & SKU
        invoice_items: invoiceItems.map(item => ({
          ...item,
          remaining_quantity: item.remaining_quantity ?? 0,
          product_item_sku_id: item.product_item_sku_id ?? null,
          product_sku_id: item.product_sku_id ?? null
        })),

        bill_adjustments: billAdjustments,
        payment_details: paymentDetails,

        total_items_quantity: totalItemsQuantity,
        total_items_amount: totalItemsAmount
      };
    });

    return commonService.okResponse(res, {
      invoices: formattedInvoices,
      total,
      page: hasPagination ? parseInt(page) : null,
      total_pages: hasPagination ? Math.ceil(total / parseInt(limit)) : 1
    });

  } catch (err) {
    console.error("Error in listSalesInvoices:", err);
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

// light search for  - Sales Return Search box
const searchInvoices = async (req, res) => {
  try {
    const { invoice_no, mobile_number, status, branch_id  } = req.query;

    // First, find customer IDs if mobile number is provided
    let customerIds = [];
    if (mobile_number) {
      const customers = await models.Customer.findAll({
        where: {
          mobile_number: {
            [Op.iLike]: `%${mobile_number.trim()}%`
          }
        },
        attributes: ['id'],
        raw: true
      });
      customerIds = customers.map(c => c.id);

      if (customerIds.length === 0) {
        return commonService.okResponse(res, {
          count: 0,
          invoices: []
        });
      }
    }

    // Build the where condition for invoices
    const whereCondition = {};

    if (invoice_no) {
      whereCondition.invoice_no = {
        [Op.iLike]: `%${invoice_no.trim()}%`
      };
    }

    if (customerIds.length > 0) {
      whereCondition.customer_id = {
        [Op.in]: customerIds
      };
    }

    if (status) {
      whereCondition.status = status;
    }

    if (branch_id) {
      whereCondition.branch_id = branch_id;
    }

    // Find all matching invoices
    const invoices = await models.SalesInvoiceBill.findAll({
      where: whereCondition,
      raw: true
    });

    if (!invoices || invoices.length === 0) {
      return commonService.notFound(res, 'No invoices found matching the criteria');
    }

    // Fetch related data for all found invoices
    const result = await Promise.all(invoices.map(async (invoice) => {
      const [customer, branch, payment, items] = await Promise.all([
        models.Customer.findOne({
          where: { id: invoice.customer_id },
          attributes: ['id', 'customer_name', 'address', 'mobile_number', 'pin_code'],
          raw: true
        }),
        models.Branch.findOne({
          where: { id: invoice.branch_id },
          attributes: ['branch_name', 'address', 'mobile', 'pin_code', 'gst_no'],
          raw: true
        }),
        models.Payment.findOne({
          where: { invoice_bill_id: invoice.id },
          raw: true
        }),
        // ← ONLY NON-RETURNED ITEMS
        models.SalesInvoiceBillItem.findAll({
          where: {
            invoice_bill_id: invoice.id,
            is_returned: false  // ← This filters out returned items
          },
          raw: true
        })
      ]);

      return {
        invoice: invoice,
        customer: customer || null,
        branch: branch || null,
        payment: payment || null,
        items: items || []
      };
    }));

    // Optional: filter out invoices that have no items after excluding returned ones
    const filteredResult = result.filter(r => r.items.length > 0);

    return commonService.okResponse(res, {
      count: filteredResult.length,
      invoices: filteredResult
    });

  } catch (error) {
    console.error('Error searching invoices:', error);
    return commonService.handleError(res, error);
  }
};

// Backfill hsn_code onto invoice items from the product master when the payload
// omits it (the invoice-creation UI lives in a separate project and does not send
// hsn_code). Without this, HSN(B2B)/HSN(B2C) reports show nothing because the HSN
// summary only lists lines that carry an HSN code. Only blank values are filled;
// an explicit hsn_code from the caller is left untouched.
const fillHsnFromProducts = async (items, transaction) => {
  if (!Array.isArray(items) || items.length === 0) return items;

  const missingProductIds = [
    ...new Set(
      items
        .filter(i => !String(i.hsn_code || "").trim() && i.product_id)
        .map(i => i.product_id)
    ),
  ];
  if (missingProductIds.length === 0) return items;

  const products = await models.Product.findAll({
    where: { id: { [Op.in]: missingProductIds }, deleted_at: null },
    attributes: ["id", "hsn_code"],
    transaction,
  });
  const hsnByProductId = new Map(
    products.map(p => [p.id, String(p.hsn_code || "").trim()])
  );

  return items.map(i =>
    !String(i.hsn_code || "").trim() && hsnByProductId.get(i.product_id)
      ? { ...i, hsn_code: hsnByProductId.get(i.product_id) }
      : i
  );
};

// New invoice - Calaculations are handled in the UI, so here we just save what we get
const createSalesInvoice = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { header = {}, items = [], payment = {}, adjustments = [] } = req.body || {};
    // Validate items
    await validateInvoiceItems({ items, header, transaction: t, isCreate: true });

    // If estimate_bill_id is provided, validate it
    let estimateBill = null;
    if (header.estimate_bill_id) {
      estimateBill = await validateEstimateForInvoice(header.estimate_bill_id, { models, transaction: t });
    }

    // ✅ DUPLICATE INVOICE NUMBER VALIDATION
    const employee = await validateDuplicateUniqueCode({
      model: models.SalesInvoiceBill,
      billField: "invoice_no",
      billValue: header.invoice_no,
      employee_id: header.employee_id,
      transaction: t,
      bill_name: "Invoice",
    })

    // Validate products
    await validateProducts(items, t);
    await validateProductItemDetails(items, t);

    // OPTIONAL BUT HIGHLY RECOMMENDED:
    // Validate numbers are sane (no negatives, NaN)
    if (header.net_total < 0 || header.total_amount < 0) {
      throw new ValidationError("Invalid invoice totals");
    }

    // PAYMENT PROCESSING

    const paymentRows = (Array.isArray(payment) ? payment : [])
      .filter(p => p.payment_mode)
      .map(p => ({
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received || 0),
        payment_date: p.payment_date || new Date(),
        transaction_id: p.transaction_id || null,
        status: "Completed",
        created_by: req.user?.id || null,
      }));

    validateCashPayment(paymentRows, req.body.customer?.pan_no);

    // ================= ADVANCE CALCULATION =================
    const advancePayments = paymentRows.filter(
      p => p.payment_mode === "Advance"
    );

    const advanceUsed = advancePayments.reduce(
      (sum, p) => sum + Number(p.amount_received || 0),
      0
    );

    // ================= TAX =================

    const hasHeaderIgst = header.igst_amount !== undefined && Number(header.igst_amount) > 0;
    const cgstAmt = hasHeaderIgst ? 0 : Number(header.cgst_amount || 0);
    const sgstAmt = hasHeaderIgst ? 0 : Number(header.sgst_amount || 0);
    const igstAmt = hasHeaderIgst ? Number(header.igst_amount || 0) : 0;

    // ================= GSTR-1 CLASSIFICATION SNAPSHOT =================
    // Snapshot the recipient GSTIN, place of supply and resolved GSTR-1 bucket
    // at save time so financial reports never re-derive from a mutable master.
    const gstSnapshot = await buildInvoiceGstSnapshot({
      header,
      cgstAmt,
      sgstAmt,
      igstAmt,
      models,
      transaction: t,
    });

    // CREATE INVOICE (NO CALCULATION)
    const bill = await models.SalesInvoiceBill.create(
      {
        estimate_bill_id: header.estimate_bill_id || null,
        invoice_no: header.invoice_no,
        invoice_date: header.invoice_date,
        invoice_time: header.invoice_time,
        employee_id: header.employee_id,
        customer_id: header.customer_id,
        branch_id: header.branch_id,

        net_total: header.net_total,
        subtotal_amount: header.subtotal_amount,

        discount_type: header.discount_type,
        discount_amount: header.discount_amount,           // user-entered
        discount_calculated: header.discount_calculated,   // UI-calculated

        cgst_percent: header.cgst_percent,
        sgst_percent: header.sgst_percent,
        igst_percent: header.igst_percent,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        igst_amount: igstAmt,

        total_amount: header.total_amount,
        amount_due: header.amount_due,
        refund_amount: header.refund_amount,
        amount_in_words: header.amount_in_words,

        total_quantity: header.total_quantity,
        hasBillAdjustment: header.hasBillAdjustment || false,
        status: header.status,

        // GSTR-1 snapshot
        ...gstSnapshot,
      },
      { transaction: t }
    );

    // PAYMENTS
    paymentRows.forEach(p => (p.invoice_bill_id = bill.id));
    const savedPayments =
      paymentRows.length > 0
        ? await models.Payment.bulkCreate(paymentRows, { transaction: t, returning: true })
        : [];

    // ADJUSTMENTS
    const savedAdjustments =
      adjustments.length > 0
        ? await models.SalesInvoiceAdjustment.bulkCreate(
          adjustments.map(adj => ({
            sales_invoice_id: bill.id,
            adjustment_type_id: adj.adjustment_type_id,
            reference_id: adj.reference_id,
            reference_no: adj.reference_no,
            adjustment_amount: Number(adj.adjustment_amount || 0),
          })),
          { transaction: t }
        )
        : [];

    if (header.status === "Invoice") {
      await lockBillAdjustmentFlags(adjustments, t);
    }

    // ITEMS (amounts already calculated by UI)
    const itemsWithHsn = await fillHsnFromProducts(items, t);
    const savedItems = await models.SalesInvoiceBillItem.bulkCreate(
      itemsWithHsn.map(i => ({
        ...i,
        invoice_bill_id: bill.id
      })),
      { transaction: t, returning: true }
    );

    // Update customer PAN
    if (req.body.customer?.pan_no && header.customer_id) {
      await models.Customer.update(
        { pan_no: req.body.customer.pan_no },
        { where: { id: header.customer_id }, transaction: t }
      );
    }

    //Create Invoice      - Status - Invoice	✅ Reduce stock
    //Create Hold Invoice	-	Status - On Hold	❌ No stock change
    //Create Invoice with amount due=0 - Status - Invoice	✅ Reduce stock
    //Create Invoice with amount due>0 - Status - Invoice	❌ No stock change

    const hasPayment = savedPayments.length > 0;
    const isFullyPaid = Number(header.amount_due) === 0;

    const shouldReduceStock =
      header.status === "Invoice" && hasPayment && isFullyPaid;
    
    if (shouldReduceStock) {
      await reduceStockForInvoice(items, t);

      await bill.update(
        { stock_deducted: true },
        { transaction: t }
      );
    }

    // ================= ADVANCE WALLET UPDATE =================
    if (
      advanceUsed > 0 &&
      header.customer_id &&
      header.status === "Invoice"
    ) {
      const customer = await models.Customer.findByPk(
        header.customer_id,
        { transaction: t }
      );

      if (customer) {
        const newWallet =
          Number(customer.wallet_advance_amount || 0) - advanceUsed;
        await customer.update(
          { wallet_advance_amount: Math.max(newWallet, 0) },
          { transaction: t }
        );
      }

      // mark receipts as used
      const receiptNos = advancePayments
        .map(p => p.transaction_id)
        .filter(Boolean);
      if (receiptNos.length) {
        await models.VoucherReceipt.update(
          { is_advance_used: true },
          {
            where: { receipt_no: receiptNos },
            transaction: t
          }
        );
      }
    }

    // ================= ESTIMATE CONVERSION =================
    if (estimateBill) {
      await markEstimateAsConverted(estimateBill, { transaction: t, employee_id: header.employee_id });
    }

    await t.commit();
    
    /*
    // Notification
    if ( header.status === "Invoice" && hasPayment && isFullyPaid) {
      await sendCustomerNotification({
        customerId: header.customer_id,
        title: "Purchase Confirmation",
        type: "PURCHASE",
        message: notificationMessages.customerPurchase(),
      });
    }
   */

    return commonService.createdResponse(res, {
      message: enMessage.billing.invoiceCreationSuccess,
      invoice: bill,
      items: savedItems,
      payments: savedPayments,
      adjustment: savedAdjustments,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err.name === "ValidationError") {
      return commonService.badRequest(res, err.message);
    }

    return commonService.handleError(res, err);

  }
};

const updateSalesInvoice = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const invoiceId = req.params.id;
    const { header = {}, items = [], payment = [], adjustments = [] } = req.body || {};

    // FETCH & VALIDATE INVOICE
    const invoice = await validateInvoiceItems({
      items,
      header,
      transaction: t,
      isCreate: false,
      excludeInvoiceId: invoiceId,
    });

    const previousStatus = invoice.status;
    const newStatus = header.status ?? invoice.status;

    // Validate products and stock
    await validateProducts(items, t);
    await validateProductItemDetails(items, t);

    if (header.net_total < 0 || header.total_amount < 0) {
      throw new ValidationError("Invalid invoice totals");
    }


    // PAYMENT PROCESSING
    const incomingPayments = Array.isArray(payment) ? payment : [];

    const existingPayments = await models.Payment.findAll({
      where: { invoice_bill_id: invoice.id },
      attributes: ["id", "payment_mode", "amount_received", "transaction_id"],
      transaction: t,
      raw: true
    });


    // ================= ADVANCE CALCULATION =================
    const oldAdvancePayments = existingPayments.filter(
      p => p.payment_mode === "Advance"
    );

    const oldAdvanceTotal = oldAdvancePayments.reduce(
      (sum, p) => sum + Number(p.amount_received || 0),
      0
    );

    const newAdvancePayments = incomingPayments.filter(
      p => p.payment_mode === "Advance"
    );

    const newAdvanceTotal = newAdvancePayments.reduce(
      (sum, p) => sum + Number(p.amount_received || 0),
      0
    );

    const advanceDiff = newAdvanceTotal - oldAdvanceTotal;

    // ================= VALIDATE CASH LIMIT =================
    const allPayments = [
      ...existingPayments.map(p => ({
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received),
      })),
      ...incomingPayments.map(p => ({
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received || 0),
      })),
    ];

    validateCashPayment(incomingPayments, req.body.customer?.pan_no);

    // Determine IGST vs CGST/SGST
    const hasIgst = Number(header.igst_amount || 0) > 0;
    const cgstAmt = hasIgst ? 0 : Number(header.cgst_amount || 0);
    const sgstAmt = hasIgst ? 0 : Number(header.sgst_amount || 0);
    const igstAmt = hasIgst ? Number(header.igst_amount || 0) : 0;

    // ================= GSTR-1 CLASSIFICATION SNAPSHOT =================
    // Recompute on edit so a changed customer / place of supply / totals keep
    // the invoice in the correct GSTR-1 bucket.
    const gstSnapshot = await buildInvoiceGstSnapshot({
      header,
      cgstAmt,
      sgstAmt,
      igstAmt,
      models,
      transaction: t,
      existing: invoice,
    });

    // ================= FETCH OLD ITEMS =================
    const oldItems = await models.SalesInvoiceBillItem.findAll({
      where: { invoice_bill_id: invoice.id },
      transaction: t,
      raw: true,
    });

    // ================= UPDATE HEADER =================
    await invoice.update(
      {
        invoice_time: header.invoice_time,
        employee_id: header.employee_id,
        customer_id: header.customer_id,
        branch_id: header.branch_id,

        net_total: header.net_total,
        subtotal_amount: header.subtotal_amount,

        discount_type: header.discount_type,
        discount_amount: header.discount_amount,
        discount_calculated: header.discount_calculated,

        cgst_percent: header.cgst_percent,
        sgst_percent: header.sgst_percent,
        igst_percent: header.igst_percent,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        igst_amount: igstAmt,

        total_amount: header.total_amount,
        amount_due: header.amount_due,
        refund_amount: header.refund_amount,
        amount_in_words: header.amount_in_words,
        total_quantity: header.total_quantity,
        hasBillAdjustment: header.hasBillAdjustment || false,
        status: newStatus,

        // GSTR-1 snapshot
        ...gstSnapshot,
      },
      { transaction: t }
    );

    // UPSERT ITEMS
    const payloadItemIds = items.filter(i => i.id).map(i => i.id);

    await models.SalesInvoiceBillItem.destroy({
      where: {
        invoice_bill_id: invoice.id,
        id: { [Op.notIn]: payloadItemIds.length ? payloadItemIds : [0] },
      },
      transaction: t,
    });

    const itemsWithHsn = await fillHsnFromProducts(items, t);
    for (const item of itemsWithHsn) {
      if (item.id) {
        await models.SalesInvoiceBillItem.update(item, {
          where: { id: item.id }, transaction: t,
        });
      } else {
        await models.SalesInvoiceBillItem.create(
          { ...item, invoice_bill_id: invoice.id },
          { transaction: t }
        );
      }
    }

    //STOCK LOGIC
    const normalize = list =>
      list
        .map(i => ({
          product_item_detail_id: i.product_item_detail_id,
          quantity: Number(i.quantity),
        }))
        .sort((a, b) => a.product_item_detail_id - b.product_item_detail_id);

    const itemsChanged =
      JSON.stringify(normalize(oldItems)) !==
      JSON.stringify(normalize(items));

    const hasPayment = allPayments.length > 0;
    //const hasPayment = incomingPayments.length > 0;
    const isFullyPaid = Number(header.amount_due) === 0;
    const isInvoice = newStatus === "Invoice";
    const wasStockDeducted = invoice.stock_deducted === true;

    const shouldReduceStock =
      isInvoice && hasPayment && isFullyPaid;

    // 🔁 RESTORE OLD STOCK
    if (wasStockDeducted && itemsChanged) {
      await restoreStockForInvoice(oldItems, t);
    }

    // 🔻 REDUCE NEW STOCK
    if (
      (!wasStockDeducted && shouldReduceStock) ||
      (wasStockDeducted && itemsChanged)
    ) {
      await reduceStockForInvoice(items, t);

      await invoice.update(
        { stock_deducted: true },
        { transaction: t }
      );
    }

    // UPSERT PAYMENTS
    const payloadPaymentIds = incomingPayments.filter(p => p.id).map(p => p.id);

    await models.Payment.destroy({
      where: {
        invoice_bill_id: invoice.id,
        id: { [Op.notIn]: payloadPaymentIds.length ? payloadPaymentIds : [0] },
      },
      transaction: t,
    });

    for (const p of incomingPayments) {
      const data = {
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received || 0),
        payment_date: p.payment_date || new Date(),
        transaction_id: p.transaction_id || null,
        status: "Completed",
      };

      if (p.id) {
        // 🔍 fetch existing payment
        const existingPayment = existingPayments.find(ep => ep.id === p.id);
        await models.Payment.update({data, payment_date: existingPayment?.payment_date }, {     
          where: { id: p.id },
          transaction: t,
        });
      } else {
        await models.Payment.create(
          { ...data, invoice_bill_id: invoice.id },
          { transaction: t }
        );
      }
    }

    // ================= ADVANCE WALLET UPDATE =================
    const becameInvoice = previousStatus !== "Invoice" && newStatus === "Invoice";
    if (header.customer_id) {
      const customer = await models.Customer.findByPk(
        header.customer_id,
        { transaction: t }
      );
      if (customer) {
        let deductionAmount = 0;
        // HOLD → INVOICE
        if (becameInvoice) {
          deductionAmount = newAdvanceTotal;
        }
        // INVOICE → INVOICE edit
        else if (advanceDiff !== 0) {
          deductionAmount = advanceDiff;
        }
        if (deductionAmount !== 0) {
          const newWallet =
            Number(customer.wallet_advance_amount || 0) - deductionAmount;
          await customer.update(
            { wallet_advance_amount: Math.max(newWallet, 0) },
            { transaction: t }
          );
        }
      }
    }

    // ================= UPDATE RECEIPT USAGE =================
    const newReceiptNos = newAdvancePayments
      .map(p => p.transaction_id)
      .filter(Boolean);

    const oldReceiptNos = oldAdvancePayments
      .map(p => p.transaction_id)
      .filter(Boolean);

    const removedReceipts = oldReceiptNos.filter(
      r => !newReceiptNos.includes(r)
    );

    if (newReceiptNos.length) {
      await models.VoucherReceipt.update(
        { is_advance_used: true },
        {
          where: { receipt_no: newReceiptNos },
          transaction: t
        }
      );
    }

    if (removedReceipts.length) {
      await models.VoucherReceipt.update(
        { is_advance_used: false },
        {
          where: { receipt_no: removedReceipts },
          transaction: t
        }
      );
    }

    // UPSERT ADJUSTMENTS
    const payloadAdjIds = adjustments.filter(a => a.id).map(a => a.id);

    const oldAdjustments = await models.SalesInvoiceAdjustment.findAll({
      where: { sales_invoice_id: invoice.id },
        transaction: t,
        raw: true,
    });

    await models.SalesInvoiceAdjustment.destroy({
      where: {
        sales_invoice_id: invoice.id,
        id: { [Op.notIn]: payloadAdjIds.length > 0 ? payloadAdjIds : [0] },
      },
      transaction: t,
    });

    const removedAdjustments = oldAdjustments.filter(
        oldAdj => !payloadAdjIds.includes(oldAdj.id)
    );

    if (removedAdjustments.length > 0) {
        await unlockBillAdjustmentFlags(removedAdjustments, t);
    }

    for (const adj of adjustments) {
      const data = {
        adjustment_type_id: adj.adjustment_type_id,
        reference_id: adj.reference_id,
        reference_no: adj.reference_no,
        adjustment_amount: Number(adj.adjustment_amount) || 0,
      };

      if (adj.id) {
        await models.SalesInvoiceAdjustment.update(data, {
          where: { id: adj.id },
          transaction: t,
        });
      } else {
        await models.SalesInvoiceAdjustment.create(
          { ...data, sales_invoice_id: invoice.id },
          { transaction: t }
        );
      }
    }

    // Update customer PAN
    if (req.body.customer?.pan_no && header.customer_id) {
      await models.Customer.update(
        { pan_no: req.body.customer.pan_no },
        { where: { id: header.customer_id }, transaction: t }
      );
    }
    // Lock adjustments
    if (newStatus === "Invoice") {
        await lockBillAdjustmentFlags(adjustments, t);
    }

    await t.commit();

    /*
    // Notification
    if (previousStatus !== "Invoice" && newStatus === "Invoice" && hasPayment &&  isFullyPaid) {
      await sendCustomerNotification({
        customerId: header.customer_id,
        title: "Purchase Confirmation",
        type: "PURCHASE",
        message: notificationMessages.customerPurchase(),
      });
    }
    */

    return commonService.okResponse(res, {
      message: "Invoice updated successfully"
    });

  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    if (err.name === "ValidationError") {
      return commonService.badRequest(res, err.message);
    }
    return commonService.handleError(res, err);
  }
};

// Get sales invoices by customer_id with optional filters
const getSalesInvoicesByCustomerId = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { from, to, status, branch_id } = req.query || {};

    if (!customer_id) {
      return commonService.badRequest(res, 'customer_id is required');
    }

    let sql = `
      WITH invoice_items AS (
        SELECT
          invoice_bill_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', id,
              'invoice_bill_id', invoice_bill_id,
              'product_id', product_id,
              'product_item_detail_id', product_item_detail_id,
              'hsn_code', hsn_code,
              'product_name_snapshot', product_name_snapshot,
              'gross_weight', gross_weight,
              'net_weight', net_weight,
              'wastage', wastage,
              'quantity', quantity,
              'rate', rate,
              'discount_amount', discount_amount,
              'amount', amount,
              'created_at', created_at,
              'updated_at', updated_at
            )
            ORDER BY id ASC
          ) AS items,
          SUM(quantity) AS total_quantity,
          SUM(amount) AS total_amount
        FROM sales_invoice_bill_items
        WHERE deleted_at IS NULL
        GROUP BY invoice_bill_id
      )
      SELECT
        i.*,
        e.employee_name as sales_person_name,
        e.employee_no as sales_person_code,

        -- Customer details
        c.customer_name,
        c.address AS customer_address,
        c.mobile_number AS customer_mobile_number,
        c.pin_code AS customer_pincode,
        c.pan_no AS customer_pan_no,
        c.gst_no AS customer_gst_no,
        ct.country_name AS customer_country_name,
        d.district_name AS customer_district_name,
        s.state_name AS customer_state_name,

        -- Branch details
        b.branch_name,
        b.address AS branch_address,
        b.mobile AS branch_mobile_number,
        b.pin_code AS branch_pincode,
        b.gst_no AS branch_gst_no,
        bd.district_name AS branch_district_name,
        bs.state_name AS branch_state_name,

        -- Items
        COALESCE(ii.items, '[]'::json) AS invoice_items,
        COALESCE(ii.total_quantity, 0) AS total_items_quantity,
        COALESCE(ii.total_amount, 0) AS total_items_amount,

        -- Get adjustments as a JSON array
        (
          SELECT COALESCE(JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', a.id,
              'adjustment_type_id', a.adjustment_type_id,
              'adjustment_type_name', bat.type_name,
              'reference_id', a.reference_id,
              'reference_no', a.reference_no,
              'adjustment_amount', a.adjustment_amount,
              'created_at', a.created_at,
              'updated_at', a.updated_at
            )
            ORDER BY a.created_at DESC
          ), '[]'::json)
          FROM sales_invoice_adjustments a
          LEFT JOIN bill_adjustment_types bat ON bat.id = a.adjustment_type_id::integer
          WHERE a.sales_invoice_id = i.id
          AND a.deleted_at IS NULL
        ) AS bill_adjustments,

        -- Total adjustment amount
        (
          SELECT COALESCE(SUM(a.adjustment_amount), 0)
          FROM sales_invoice_adjustments a
          WHERE a.sales_invoice_id = i.id
          AND a.deleted_at IS NULL
        ) AS total_adjustment_amount,

        -- Payment details
        (
          SELECT COALESCE(JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', p.id,
              'payment_mode', p.payment_mode,
              'amount_received', p.amount_received,
              'payment_date', p.payment_date,
              'transaction_id', p.transaction_id,
              'status', p.status,
              'created_at', p.created_at,
              'updated_at', p.updated_at
            )
            ORDER BY p.created_at DESC
          ), '[]'::json)
          FROM payments p
          WHERE p.invoice_bill_id = i.id
          AND p.deleted_at IS NULL
        ) AS payment_details,

        -- Calculate total paid amount
        (
          SELECT COALESCE(SUM(p.amount_received), 0)
          FROM payments p
          WHERE p.invoice_bill_id = i.id
          AND p.deleted_at IS NULL
        ) AS total_paid_amount

      FROM sales_invoice_bills i
      LEFT JOIN employees e ON e.id = i.employee_id

      -- Customer joins
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN districts d ON d.id = c.district_id
      LEFT JOIN states s ON s.id = c.state_id
      LEFT JOIN countries ct ON ct.id = c.country_id

      -- Branch joins
      LEFT JOIN branches b ON b.id = i.branch_id
      LEFT JOIN districts bd ON bd.id = b.district_id
      LEFT JOIN states bs ON bs.id = b.state_id

      -- Items join
      LEFT JOIN invoice_items ii ON ii.invoice_bill_id = i.id

      WHERE i.deleted_at IS NULL and i.is_active = true
      AND i.customer_id = :customer_id
    `;

    const replacements = { customer_id };

    if (from) {
      sql += ` AND i.invoice_date >= :from`;
      replacements.from = from;
    }

    if (to) {
      sql += ` AND i.invoice_date <= :to`;
      replacements.to = to;
    }

    if (status) {
      sql += ` AND i.status = :status`;
      replacements.status = status;
    }

    if (branch_id) {
      sql += ` AND i.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    sql += ` ORDER BY i.invoice_date DESC, i.created_at DESC`;

    // Execute the query
    const invoices = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Extract all product_item_detail_ids for stock lookup
    const productItemDetailIds = invoices
      .flatMap(inv =>
        (typeof inv.invoice_items === "string"
          ? JSON.parse(inv.invoice_items)
          : inv.invoice_items || [])
          .map(item => item.product_item_detail_id)
      )
      .filter(Boolean);

    // Fetch current stock from ProductItemDetails
    const productItems = productItemDetailIds.length ? await sequelize.query(
      `SELECT id, sku_id, quantity FROM "productItemDetails" WHERE id IN (:ids)`,
      {
        replacements: { ids: productItemDetailIds },
        type: sequelize.QueryTypes.SELECT
      }
    ) : [];

    // Create lookup map
    const productItemMap = productItems.reduce((acc, row) => {
      acc[row.id] = {
        sku_id: row.sku_id,
        quantity: row.quantity
      };
      return acc;
    }, {});

    // Format the response
    const formattedInvoices = invoices.map(invoice => {
      // Parse numeric fields safely
      const subtotal = parseFloat(invoice.subtotal_amount || 0);
      const cgst = parseFloat(invoice.cgst_amount || 0);
      const sgst = parseFloat(invoice.sgst_amount || 0);
      const igst = parseFloat(invoice.igst_amount || 0);

      const discountAmount = parseFloat(invoice.discount_amount || 0);
      const totalAfterAdjustment = parseFloat(invoice.total_amount || 0);
      const totalAdjustment = parseFloat(invoice.total_adjustment_amount || 0);
      const totalPaid = parseFloat(invoice.total_paid_amount || 0);

      // Correct total before discount
      const totalBeforeAdjustment = subtotal + cgst + sgst + igst;

      // Amount due (can be negative → refund)
      const amountDue = totalAfterAdjustment - totalPaid;

      // Parse JSON safely
      const invoiceItems =
        typeof invoice.invoice_items === "string"
          ? JSON.parse(invoice.invoice_items)
          : invoice.invoice_items || [];

      const billAdjustments =
        typeof invoice.bill_adjustments === "string"
          ? JSON.parse(invoice.bill_adjustments)
          : invoice.bill_adjustments || [];

      const paymentDetails =
        typeof invoice.payment_details === "string"
          ? JSON.parse(invoice.payment_details)
          : invoice.payment_details || [];

      return {
        ...invoice,

        // Totals
        total_amount_before_adjustment: totalBeforeAdjustment.toFixed(2),
        total_amount_after_adjustment: totalAfterAdjustment.toFixed(2),
        total_paid_amount: totalPaid.toFixed(2),
        amount_due: amountDue.toFixed(2),

        // Line items with remaining stock & SKU
        invoice_items: invoiceItems.map(item => ({
          ...item,
          remaining_quantity:
            productItemMap[item.product_item_detail_id]?.quantity ?? 0,
          product_item_sku_id:
            productItemMap[item.product_item_detail_id]?.sku_id ?? null
        })),

        bill_adjustments: billAdjustments,
        payment_details: paymentDetails,

        total_items_quantity: parseInt(invoice.total_items_quantity) || 0,
        total_items_amount: parseFloat(invoice.total_items_amount) || 0
      };
    });

    return commonService.okResponse(res, {
      customer_id: parseInt(customer_id),
      count: formattedInvoices.length,
      invoices: formattedInvoices
    });

  } catch (err) {
    console.error("Error in getSalesInvoicesByCustomerId:", err);
    return commonService.handleError(res, err);
  }
};


// Export sales invoices as Excel
const exportSalesInvoicesExcel = async (req, res) => {
  try {
    const { from, to, date, employee_id, customer_id, branch_id, status } = req.query || {};

    let sql = `
      SELECT
        i.id,
        i.invoice_no,
        i.invoice_date,
        i.net_total,
        i.subtotal_amount,
        i.discount_amount,
        i.total_amount,
        e.employee_name AS sales_person_name,
        c.customer_name,

        -- Sum of net_weight from items
        COALESCE((
          SELECT SUM(sii.net_weight)
          FROM sales_invoice_bill_items sii
          WHERE sii.invoice_bill_id = i.id
          AND sii.deleted_at IS NULL
        ), 0) AS total_net_weight,

        -- Sales Return adjustment amount
        COALESCE((
          SELECT SUM(a.adjustment_amount)
          FROM sales_invoice_adjustments a
          LEFT JOIN bill_adjustment_types bat ON bat.id = a.adjustment_type_id::integer
          WHERE a.sales_invoice_id = i.id
          AND a.deleted_at IS NULL
          AND bat.type_name = 'Sales Return'
        ), 0) AS sales_return_amount,

        -- Old Jewel adjustment amount
        COALESCE((
          SELECT SUM(a.adjustment_amount)
          FROM sales_invoice_adjustments a
          LEFT JOIN bill_adjustment_types bat ON bat.id = a.adjustment_type_id::integer
          WHERE a.sales_invoice_id = i.id
          AND a.deleted_at IS NULL
          AND bat.type_name = 'Old Jewel'
        ), 0) AS old_jewel_amount

      FROM sales_invoice_bills i
      LEFT JOIN employees e ON e.id = i.employee_id
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.deleted_at IS NULL AND i.is_active = true
    `;

    const replacements = {};

    if (from) {
      sql += ` AND i.invoice_date >= :from`;
      replacements.from = from;
    }
    if (to) {
      sql += ` AND i.invoice_date <= :to`;
      replacements.to = to;
    }
    if (date) {
      sql += ` AND DATE(i.invoice_date) = :date`;
      replacements.date = date;
    }
    if (employee_id) {
      sql += ` AND i.employee_id = :employee_id`;
      replacements.employee_id = employee_id;
    }
    if (customer_id) {
      sql += ` AND i.customer_id = :customer_id`;
      replacements.customer_id = customer_id;
    }
    if (branch_id) {
      sql += ` AND i.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }
    if (status) {
      sql += ` AND i.status = :status`;
      replacements.status = status;
    }

    sql += ` ORDER BY i.invoice_date DESC, i.created_at DESC`;

    const invoices = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Build Excel workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sales Invoices");

    // Define columns
    sheet.columns = [
      { header: "S.No.", key: "sno", width: 8 },
      { header: "Customer Name", key: "customer_name", width: 25 },
      { header: "Date of Invoice", key: "invoice_date", width: 16 },
      { header: "Invoice Number", key: "invoice_no", width: 18 },
      { header: "Gross Total", key: "gross_total", width: 15 },
      { header: "Net Total", key: "net_total", width: 15 },
      { header: "Discount", key: "discount", width: 12 },
      { header: "Sales Return Amount", key: "sales_return_amount", width: 20 },
      { header: "Old Jewel Amount", key: "old_jewel_amount", width: 18 },
      { header: "Total", key: "total", width: 15 },
      { header: "Sales Person Name", key: "sales_person_name", width: 22 },
      { header: "Net Weight", key: "net_weight", width: 14 },
    ];

    // Style header row
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { horizontal: "center" };

    // Add data rows
    invoices.forEach((inv, index) => {
      sheet.addRow({
        sno: index + 1,
        customer_name: inv.customer_name || "",
        invoice_date: inv.invoice_date || "",
        invoice_no: inv.invoice_no || "",
        gross_total: parseFloat(inv.net_total || 0),
        net_total: parseFloat(inv.subtotal_amount || 0),
        discount: parseFloat(inv.discount_amount || 0),
        sales_return_amount: parseFloat(inv.sales_return_amount || 0),
        old_jewel_amount: parseFloat(inv.old_jewel_amount || 0),
        total: parseFloat(inv.total_amount || 0),
        sales_person_name: inv.sales_person_name || "",
        net_weight: parseFloat(inv.total_net_weight || 0),
      });
    });

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales_invoices.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error in exportSalesInvoicesExcel:", err);
    return commonService.handleError(res, err);
  }
};

// Toggle active status for sales invoice
const toggleSalesInvoiceActive = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== "boolean") {
            await t.rollback();
            return commonService.badRequest(res, "is_active must be boolean");
        }

        const invoice = await models.SalesInvoiceBill.findByPk(id,
                { transaction: t }
            );

        if (!invoice) {
            await t.rollback();
            return commonService.notFound(res, "Sales invoice not found");
        }

        // Prevent reactivation
        if (is_active === true) {
            await t.rollback();
            return commonService.badRequest(
                res, "Deactivated invoice cannot be activated again"
            );
        }

        if (is_active === false) {
            // ======================
            // RESTORE STOCK
            // ======================
            if (invoice.stock_deducted) {
                const invoiceItems =
                    await models.SalesInvoiceBillItem.findAll({
                        where: { invoice_bill_id: invoice.id }, transaction: t
                    });

                await restoreStockForInvoice(invoiceItems, t);
                await invoice.update({ stock_deducted: false }, { transaction: t });
            }

            // ======================
            // UNLOCK ADJUSTMENTS
            // ======================
            const adjustments =
                await models.SalesInvoiceAdjustment.findAll({
                    where: { sales_invoice_id: invoice.id },
                    transaction: t,
                    raw: true
                });

            await unlockBillAdjustmentFlags(adjustments, t);
            console.log("ADJUSTMENTS BEFORE UNLOCK", JSON.stringify(adjustments, null, 2));

          // ======================
          // Restore Advance
          // ======================
          const advancePayments =
            await models.Payment.findAll({
                where: {
                    invoice_bill_id: invoice.id,  // Get all advance payments used in this invoice
                    payment_mode: "Advance"
                },
                transaction: t
            });

          const receiptNos = advancePayments.map(x => x.transaction_id).filter(Boolean);
          
          // Fetch Voucher Receipts
          const receipts = await models.VoucherReceipt.findAll({
                where: {
                    branch_id: invoice.branch_id, 
                    receipt_no: receiptNos,
                    bill_type_id: 3
                },
                transaction: t
            });

          // Restore customer wallet
          for (const receipt of receipts) {
            const customer = await models.Customer.findOne({
                  where: {
                      ledger_id: receipt.account_id
                  }, transaction: t
              });

            if (customer) {
              await customer.update(
                  {
                      wallet_advance_amount: Number(customer.wallet_advance_amount || 0) + Number(receipt.amount || 0)
                  }, { transaction: t }
              );
            }
          }

          // ======================
          // MAKE RECEIPTS REUSABLE
          // ======================
          await models.VoucherReceipt.update(
          {
            is_advance_used: false
          },
          {
            where: { receipt_no: receiptNos }, transaction: t
          });

          await invoice.update({is_active: false, }, { transaction: t });
        }

        await t.commit();

        return commonService.okResponse(res, { message: "Invoice deactivated successfully" });

    } catch (err) {
        await t.rollback();
        return commonService.handleError(
            res,
            err
        );
    }
};

// To fetch advance payments for a customer (for adjustment purposes in invoice creation)
const getCustomerAdvanceReceipts = async (req, res) => {
  try {

    const { customer_id } = req.params;

    if (!customer_id) {
      return commonService.badRequest(res, {
        message: "customer_id is required"
      });
    }

    // 1️⃣ Get customer ledger
    const customer = await models.Customer.findOne({
      where: {
        id: customer_id,
        deleted_at: null
      },
      attributes: ["ledger_id", "wallet_advance_amount"]
    });

    if (!customer || !customer.ledger_id) {
      return commonService.okResponse(res, {
        advances: [],
        wallet_balance: 0
      });
    }

    // 2️⃣ Fetch advance receipts
    const receipts = await models.VoucherReceipt.findAll({
      where: {
        account_id: customer.ledger_id,
        bill_type_id: 3,
        deleted_at: null,
        is_active: true // Only Active receipts
      },
      attributes: [
        "id",
        "receipt_no",
        "is_advance_used",
        "receipt_date",
        "amount",
        "transaction_no"
      ],
      order: [["created_at", "ASC"]]
    });

    // 3️⃣ Format response for UI
    const advances = receipts.map(r => ({
      receipt_id: r.id,
      receipt_no: r.receipt_no,
      receipt_date: r.receipt_date,
      amount: Number(r.amount),
      is_advance_used: r.is_advance_used,
      transaction_no: r.transaction_no
    }));

    return commonService.okResponse(res, {
      wallet_balance: Number(customer.wallet_advance_amount || 0),
      advances
    });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  generateSalesInvoiceNo,
  createSalesInvoice,
  getSalesInvoiceById,
  listSalesInvoices,
  getSalesInvoicesByCustomerId,
  deleteSalesInvoice,
  searchInvoices,
  updateSalesInvoice,
  exportSalesInvoicesExcel,
  toggleSalesInvoiceActive,
  getCustomerAdvanceReceipts
};
