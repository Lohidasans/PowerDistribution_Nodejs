const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { validateProductItemDetails, validateProducts} = require('../helpers/billingValidations');
const { Op } = require("sequelize");

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

// Create Sales invoice (header + items + payment)
const createSalesInvoice = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { header = {}, items = [], payment = {}, adjustments = [] } = req.body || {};

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(res, "At least one item is required");
    }

    // Check if invoice_no already exists
    if (header.invoice_no) {
      const existing = await models.SalesInvoiceBill.findOne({
        where: {
          invoice_no: header.invoice_no,
          deleted_at: null,
        },
      });
      if (existing) {
        await t.rollback();
        return commonService.badRequest(res, { message: "Invoice no already exists" });
      }
    }

    // Validate products and stock
    await validateProducts(items, t);
    await validateProductItemDetails(items, t);

    // Calculate totals
    let subtotal = 0;
    let totalQty = 0;
    const itemRows = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate || 0);
      const itemAmount = qty * rate;
      const itemDiscount = Number(it.discount_amount || 0);
      const amount = itemAmount - itemDiscount;

      subtotal += amount;
      totalQty += qty;

      return {
        product_id: it.product_id,
        product_item_detail_id: it.product_item_detail_id ?? null,
        hsn_code: it.hsn_code ?? null,
        product_name_snapshot: it.product_name_snapshot ?? null,
        net_weight: it.net_weight,
        gross_weight: it.gross_weight,
        wastage: it.wastage,
        quantity: qty,
        rate: rate,
        discount_amount: itemDiscount,
        amount: amount,
      };
    });

    // Tax & header discount
    const cgstAmt = Number(header.cgst_amount ?? 0);
    const sgstAmt = Number(header.sgst_amount ?? 0);

    let headerDiscountAmt = 0;
    if (header.discount_amount && header.discount_amount > 0) {
      if (header.discount_type === "Percentage") {
        headerDiscountAmt = (subtotal * Number(header.discount_amount)) / 100;
      } else {
        headerDiscountAmt = Number(header.discount_amount);
      }
      headerDiscountAmt = Math.min(headerDiscountAmt, subtotal);
    }

    const taxableAmount = subtotal - headerDiscountAmt;
    let total = taxableAmount + cgstAmt + sgstAmt;

    // Adjustments
    let totalAdjustment = 0;
    if (Array.isArray(adjustments) && adjustments.length > 0) {
      totalAdjustment = adjustments.reduce((sum, adj) => sum + (Number(adj.adjustment_amount) || 0), 0);

      if (totalAdjustment > total) {
        await t.rollback();
        return commonService.badRequest(res, {
          message: "Total adjustment amount cannot exceed the invoice total",
        });
      }

      total -= totalAdjustment;
      if (total < 0) total = 0;
    }
    // Round off total_amount to nearest integer when adjustments exist
    total = Math.round(total);

    // PAYMENT PROCESSING
    const paymentInput = Array.isArray(payment) ? payment : [];
    const paymentRows = paymentInput
      .filter(p => p.payment_mode)
      .map(p => ({
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received || 0),
        payment_date: p.payment_date || new Date(),
        transaction_id: p.transaction_id || null,
        status: "Completed",
        created_by: req.user?.id || null,
      }));

    const totalPaid = paymentRows.reduce((sum, p) => sum + p.amount_received, 0);

    let refundAmount = 0;
    let amountDue = total;
    if (totalPaid > total) {
      refundAmount = totalPaid - total;
      amountDue = 0;
    } else {
      amountDue = total - totalPaid;
    }

    // === PAN CARD VALIDATION: Total CASH received ≥ ₹2 Lakh ===
    const totalCashReceived = paymentRows
      .filter(p => p.payment_mode?.toLowerCase() === 'cash')
      .reduce((sum, p) => sum + p.amount_received, 0);

    if (totalCashReceived >= 200000) {
      await t.rollback();
      return commonService.badRequest(res, enMessage.billing.panCardRequired);
    }

    // Create invoice bill
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
        discount_type: header.discount_type || null,
        discount_amount: headerDiscountAmt,
        total_amount: total,
        amount_due: amountDue,
        refund_amount: refundAmount,
        total_quantity: totalQty,
        hasBillAdjustment: header.hasBillAdjustment || false,
        status: header.status,
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    // Now add invoice_bill_id to payments
    paymentRows.forEach(p => {
      p.invoice_bill_id = bill.id;
    });

    // Create payments
    let savedPayments = [];
    if (paymentRows.length > 0) {
      savedPayments = await models.Payment.bulkCreate(paymentRows, {
        transaction: t,
        returning: true,
      });
    }

    // Adjustments
    let savedAdjustments = [];
    if (Array.isArray(adjustments) && adjustments.length > 0) {
      const adjustmentRows = adjustments.map(adj => ({
        sales_invoice_id: bill.id,
        adjustment_type_id: adj.adjustment_type_id,
        reference_id: adj.reference_id,
        reference_no: adj.reference_no,
        adjustment_amount: Number(adj.adjustment_amount) || 0,
      }));

      savedAdjustments = await models.SalesInvoiceAdjustment.bulkCreate(adjustmentRows, { transaction: t });

      // Update is_bill_adjusted flags
      for (const adj of adjustments) {
        if (adj.reference_id) {
          if (adj.adjustment_type_id === 1) { // Sales Return
            await models.SalesReturn.update(
              { is_bill_adjusted: true },
              { where: { id: adj.reference_id }, transaction: t }
            );
          } else if (adj.adjustment_type_id === 2) { // Old Jewel
            await models.OldJewel.update(
              { is_bill_adjusted: true },
              { where: { id: adj.reference_id }, transaction: t }
            );
          }
        }
      }
    }

    // Create invoice items
    const withFK = itemRows.map(row => ({ ...row, invoice_bill_id: bill.id }));
    const savedItems = await models.SalesInvoiceBillItem.bulkCreate(withFK, { transaction: t, returning: true });

    // Update customer PAN
    if (req.body.customer?.pan_no && header.customer_id) {
      await models.Customer.update(
        { pan_no: req.body.customer.pan_no },
        { where: { id: header.customer_id }, transaction: t }
      );
    }

    // Reduce stock only if status = "Invoice"
    if (header.status === "Invoice" && savedPayments.length > 0) {
      for (const item of items) {
        if (item.product_item_detail_id && item.quantity > 0) {
          const productItemDetail = await models.ProductItemDetail.findByPk(
            item.product_item_detail_id,
            { transaction: t }
          );

          if (!productItemDetail) {
            await t.rollback();
            return commonService.badRequest(res, `Product item detail not found for ID: ${item.product_item_detail_id}`);
          }

          const newQuantity = productItemDetail.quantity - item.quantity;
          if (newQuantity < 0) {
            await t.rollback();
            return commonService.badRequest(res, `Insufficient stock for product item detail ID: ${item.product_item_detail_id}`);
          }

          await productItemDetail.update({ quantity: newQuantity }, { transaction: t });
        }
      }
    }

    await t.commit();

    return commonService.createdResponse(res, {
      message: enMessage.billing.invoiceCreationSuccess,
      invoice: bill,
      items: savedItems,
      payments: savedPayments,
      adjustment: savedAdjustments,
    });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    if (err.message.includes('Invalid product_id') ||
      err.message.includes('Invalid product_item_detail_id')) {
      return commonService.badRequest(res, err.message);
    }
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
    const { from, to, invoice_no, employee_id, customer_id, branch_id, order_type, search, status } = req.query || {};

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

      WHERE i.deleted_at IS NULL
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

    if (employee_id) {
      sql += ` AND i.employee_id = :employee_id`;
      replacements.employee_id = employee_id;
    }

    if (invoice_no) {
      sql += ` AND i.invoice_no = :invoice_no`;
      replacements.invoice_no = invoice_no;
    }

    if (customer_id) {
      sql += ` AND i.customer_id = :customer_id`;
      replacements.customer_id = customer_id;
    }

    if (branch_id) {
      sql += ` AND i.branch_id = :branch_id`;
      replacements.branch_id = branch_id;
    }

    if (order_type) {
      sql += ` AND i.order_type = :order_type`;
      replacements.order_type = order_type;
    }

    if (status) {
      sql += ` AND i.status = :status`;
      replacements.status = status;
    }

    if (search) {
      sql += ` AND (
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

    sql += ` ORDER BY i.created_at DESC`;

    // Execute the query
    const invoices = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Remaining quantity logic - Extract all product_item_detail_ids
    const productItemDetailIds = invoices
      .flatMap(inv =>
        (typeof inv.invoice_items === "string"
          ? JSON.parse(inv.invoice_items)
          : inv.invoice_items || [])
          .map(item => item.product_item_detail_id)
      )
      .filter(Boolean);

    // Fetch current stock from ProductItemDetails
    const productItems = productItemDetailIds.length ? await sequelize.query(`SELECT id, sku_id, quantity FROM "productItemDetails" WHERE id IN (:ids)`,
    {
      replacements: { ids: productItemDetailIds },
      type: sequelize.QueryTypes.SELECT
    }) : [];

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
      const totalPaid = parseFloat(invoice.total_paid_amount || 0);
      const totalAfterAdjustment = parseFloat(invoice.total_amount || 0);
      const totalAdjustment = parseFloat(invoice.total_adjustment_amount || 0);
      const totalBeforeAdjustment = totalAfterAdjustment + totalAdjustment;
      const amountDue = totalAfterAdjustment - totalPaid;
      const invoiceItems =
        typeof invoice.invoice_items === "string"
          ? JSON.parse(invoice.invoice_items)
          : invoice.invoice_items || [];

      return {
        ...invoice,

        total_amount_before_adjustment: totalBeforeAdjustment.toFixed(2),
        total_amount_after_adjustment: totalAfterAdjustment.toFixed(2),
        total_paid_amount: totalPaid.toFixed(2),
        amount_due: amountDue.toFixed(2),

        invoice_items: invoiceItems.map(item => ({
          ...item,
          remaining_quantity: productItemMap[item.product_item_detail_id]?.quantity ?? 0,
          product_item_sku_id: productItemMap[item.product_item_detail_id]?.sku_id ?? null
        })),

        bill_adjustments:
          typeof invoice.bill_adjustments === "string"
            ? JSON.parse(invoice.bill_adjustments)
            : invoice.bill_adjustments || [],

        payment_details:
          typeof invoice.payment_details === "string"
            ? JSON.parse(invoice.payment_details)
            : invoice.payment_details || [],

        total_items_quantity:
          parseInt(invoice.total_items_quantity) || 0,

        total_items_amount:
          parseFloat(invoice.total_items_amount) || 0
      };
    });

    return commonService.okResponse(res, {
      invoices: formattedInvoices
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
    const { invoice_no, mobile_number, status } = req.query;

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

const updateSalesInvoice = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const invoiceId = req.params.id;
    const { header = {}, items = [], payment = [], adjustments = [] } = req.body || {};

    // 1. FETCH & VALIDATE INVOICE
    const invoice = await models.SalesInvoiceBill.findByPk(invoiceId, {
      transaction: t,
    });

    if (!invoice) {
      await t.rollback();
      return commonService.notFound(res, "Invoice not found");
    }

    if (invoice.status === "Invoice") {
      await t.rollback();
      return commonService.badRequest(
        res,
        "Finalized invoice cannot be edited"
      );
    }

    const status = header.status ?? invoice.status;

    // 2. ITEMS VALIDATION
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "At least one item is required"
      );
    }

    // Validate products and stock
    await validateProducts(items, t);
    await validateProductItemDetails(items, t);

    // RECALCULATE TOTALS
    let subtotal = 0;
    let totalQty = 0;

    const itemRows = items.map(it => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate || 0);
      const itemAmount = qty * rate;
      const itemDiscount = Number(it.discount_amount || 0);
      const amount = itemAmount - itemDiscount;

      subtotal += amount;
      totalQty += qty;

      return {
        id: it.id || null,
        product_id: it.product_id,
        product_item_detail_id: it.product_item_detail_id ?? null,
        hsn_code: it.hsn_code ?? null,
        product_name_snapshot: it.product_name_snapshot ?? null,
        net_weight: it.net_weight,
        gross_weight: it.gross_weight,
        wastage: it.wastage,
        quantity: qty,
        rate: rate,
        discount_amount: itemDiscount,
        amount: amount,
      };
    });

    const cgstAmt = Number(header.cgst_amount ?? 0);
    const sgstAmt = Number(header.sgst_amount ?? 0);

    let headerDiscountAmt = 0;
    if (header.discount_amount && header.discount_amount > 0) {
      if (header.discount_type === "Percentage") {
        headerDiscountAmt = (subtotal * Number(header.discount_amount)) / 100;
      } else {
        headerDiscountAmt = Number(header.discount_amount);
      }
      headerDiscountAmt = Math.min(headerDiscountAmt, subtotal);
    }

    let total = subtotal - headerDiscountAmt + cgstAmt + sgstAmt;

    // 5. APPLY ADJUSTMENTS (CALC ONLY)
    let totalAdjustment = 0;
    if (Array.isArray(adjustments) && adjustments.length > 0) {
      totalAdjustment = adjustments.reduce(
        (sum, adj) => sum + (Number(adj.adjustment_amount) || 0),
        0
      );

      if (totalAdjustment > total) {
        await t.rollback();
        return commonService.badRequest(res, {
          message: "Total adjustment amount cannot exceed invoice total",
          maxAllowedAdjustment: total,
          attemptedAdjustment: totalAdjustment,
        });
      }

      total -= totalAdjustment;
      if (total < 0) total = 0; 
    }
    // Round off total_amount to nearest integer when adjustments exist
    total = Math.round(total);

    // 5. PAYMENT PROCESSING & CASH VALIDATION
    const incomingPayments = Array.isArray(payment) ? payment : [];

    // Fetch existing payments
    const existingPayments = await models.Payment.findAll({
      where: { invoice_bill_id: invoice.id },
      attributes: ['id', 'payment_mode', 'amount_received'],
      transaction: t,
    });

    // Combine existing + incoming (excluding deleted ones)
    const allPayments = [
      ...existingPayments.map(p => ({
        id: p.id,
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received),
      })),
      ...incomingPayments
        .filter(p => p.payment_mode)
        .map(p => ({
          id: p.id || null,
          payment_mode: p.payment_mode,
          amount_received: Number(p.amount_received || 0),
        })),
    ];

    const totalPaid = allPayments.reduce((sum, p) => sum + p.amount_received, 0);

    let refundAmount = 0;
    let amountDue = total;

    if (totalPaid > total) {
      refundAmount = totalPaid - total;
      amountDue = 0;
    } else {
      amountDue = total - totalPaid;
    }

    // === PAN CARD VALIDATION: Total CASH ≥ ₹2 Lakh ===
    const totalCashReceived = allPayments
      .filter(p => p.payment_mode?.toLowerCase() === 'cash')
      .reduce((sum, p) => sum + p.amount_received, 0);

    if (totalCashReceived >= 200000) {
      await t.rollback();
      return commonService.badRequest(res, enMessage.billing.panCardRequired);
    }
    // === END VALIDATION ===

    // 6. UPDATE INVOICE HEADER
    await invoice.update(
      {
        invoice_date: header.invoice_date || invoice.invoice_date,
        invoice_time: header.invoice_time || invoice.invoice_time,
        employee_id: header.employee_id,
        customer_id: header.customer_id,
        branch_id: header.branch_id,
        subtotal_amount: subtotal,
        cgst_percent: header.cgst_percent,
        sgst_percent: header.sgst_percent,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        discount_type: header.discount_type,
        discount_amount: headerDiscountAmt,
        total_amount: total,
        amount_due: amountDue,
        refund_amount: refundAmount,
        total_quantity: totalQty,
        hasBillAdjustment: header.hasBillAdjustment,
        status: status,
      },
      { transaction: t }
    );

    // 7. UPSERT INVOICE ITEM DETAILS
    const payloadItemIds = itemRows.filter(i => i.id).map(i => i.id);

    await models.SalesInvoiceBillItem.destroy({
      where: {
        invoice_bill_id: invoice.id,
        id: { [Op.notIn]: payloadItemIds.length > 0 ? payloadItemIds : [0] },
      },
      transaction: t,
    });

    for (const row of itemRows) {
      if (row.id) {
        await models.SalesInvoiceBillItem.update(row, {
          where: { id: row.id },
          transaction: t,
        });
      } else {
        await models.SalesInvoiceBillItem.create(
          { ...row, invoice_bill_id: invoice.id },
          { transaction: t }
        );
      }
    }

    // 8. UPSERT PAYMENTS
    const payloadPaymentIds = incomingPayments.filter(p => p.id).map(p => p.id);

    await models.Payment.destroy({
      where: {
        invoice_bill_id: invoice.id,
        id: { [Op.notIn]: payloadPaymentIds.length > 0 ? payloadPaymentIds : [0] },
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
        await models.Payment.update(data, {
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

    // 9. UPSERT ADJUSTMENTS
    const payloadAdjIds = adjustments.filter(a => a.id).map(a => a.id);

    await models.SalesInvoiceAdjustment.destroy({
      where: {
        sales_invoice_id: invoice.id,
        id: { [Op.notIn]: payloadAdjIds.length > 0 ? payloadAdjIds : [0] },
      },
      transaction: t,
    });

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

    // FINALIZE SIDE EFFECTS (ONLY IF STATUS = "Invoice")
    if (status === "Invoice") {
      // Reduce stock
      for (const item of items) {
        if (item.product_item_detail_id && item.quantity > 0) {
          const productItemDetail = await models.ProductItemDetail.findByPk(
            item.product_item_detail_id,
            { transaction: t }
          );

          if (!productItemDetail) {
            await t.rollback();
            return commonService.badRequest(
              res,
              `Product item detail not found: ${item.product_item_detail_id}`
            );
          }

          const newQty = productItemDetail.quantity - Number(item.quantity);

          if (newQty < 0) {
            await t.rollback();
            return commonService.badRequest(
              res,
              `Insufficient stock for item ${item.product_item_detail_id}`
            );
          }

          await productItemDetail.update(
            { quantity: newQty },
            { transaction: t }
          );
        }
      }

      // Lock adjustments
      for (const adj of adjustments) {
        if (adj.reference_id) {
          if (adj.adjustment_type_id === 1) {
            await models.SalesReturn.update(
              { is_bill_adjusted: true },
              { where: { id: adj.reference_id }, transaction: t }
            );
          } else if (adj.adjustment_type_id === 2) {
            await models.OldJewel.update(
              { is_bill_adjusted: true },
              { where: { id: adj.reference_id }, transaction: t }
            );
          }
        }
      }
    }

    await t.commit();
    return commonService.okResponse(res, {
      message: "Invoice updated successfully",
    });

  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    if (err.message.includes('Invalid product_id') ||
      err.message.includes('Invalid product_item_detail_id')) {
      return commonService.badRequest(res, err.message);
    }
    return commonService.handleError(res, err);
  }
};


module.exports = {
  generateSalesInvoiceNo,
  createSalesInvoice,
  getSalesInvoiceById,
  listSalesInvoices,
  deleteSalesInvoice,
  searchInvoices,
  updateSalesInvoice
};
