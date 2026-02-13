const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { validateProductItemDetails,
  validateProducts,
  reduceStockForInvoice,
  validateCashPayment,
  updateBillAdjustmentFlags,
  validateInvoiceItems,
  validateEstimateForInvoice,
  markEstimateAsConverted } = require('../helpers/billingValidations');
const { calculateItemsAndSubtotal, calculateInvoiceTotals, calculatePaymentSummary } = require("../helpers/billingCalculations");
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

/*
// Create Sales invoice (header + items + payment)
const createSalesInvoice = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { header = {}, items = [], payment = {}, adjustments = [] } = req.body || {};

    // Validate items
    await validateInvoiceItems({items, header, transaction: t, isCreate: true,});

    // Validate products and stock
    await validateProducts(items, t);
    await validateProductItemDetails(items, t);

    // Calculate totals
    const { itemRows, netTotal, totalQty } = calculateItemsAndSubtotal(items);
      
    // Handle IGST vs SGST/CGST logic for header totals
    const {
      subtotal,
      total,
      discountGross,
      discountCalculated,
      cgstAmt,
      sgstAmt,
      igstAmt,
      hasHeaderIgst
    } = calculateInvoiceTotals({
      netTotal,
      header,
      adjustments
    });

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

    const { amountDue, refundAmount } = calculatePaymentSummary(paymentRows, total);

    // === PAN CARD VALIDATION: Total CASH received ≥ ₹2 Lakh ===
    validateCashPayment(paymentRows);

    // Create invoice bill
    const bill = await models.SalesInvoiceBill.create(
      {
        invoice_no: header.invoice_no,
        invoice_date: header.invoice_date || new Date(),
        invoice_time: header.invoice_time || null,
        employee_id: header.employee_id,
        customer_id: header.customer_id || null,
        branch_id: header.branch_id || null,
        netTotal : netTotal, // sum of items amounts
        subtotal_amount: subtotal,   // net total - discount
        cgst_percent: hasHeaderIgst ? null : (header.cgst_percent || null),
        sgst_percent: hasHeaderIgst ? null : (header.sgst_percent || null),
        igst_percent: hasHeaderIgst ? (header.igst_percent || null) : null,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        igst_amount: igstAmt,
        discount_type: header.discount_type || null,
        discount_amount: discountGross,
        discount_calculated: discountCalculated,
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
      await updateBillAdjustmentFlags(adjustments, t);
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
    await reduceStockForInvoice(items, header.status, savedPayments, t);
    
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
    if (err.name === "ValidationError") {
      return commonService.badRequest(res, err.message);
    }
    return commonService.handleError(res, err);
  }
};  */

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
      // Parse numeric fields safely
      const subtotal = parseFloat(invoice.subtotal_amount || 0);
      const cgst = parseFloat(invoice.cgst_amount || 0);
      const sgst = parseFloat(invoice.sgst_amount || 0);
      const igst = parseFloat(invoice.igst_amount || 0);

      const discountAmount = parseFloat(invoice.discount_amount || 0);
      const totalAfterAdjustment = parseFloat(invoice.total_amount || 0);
      const totalAdjustment = parseFloat(invoice.total_adjustment_amount || 0);
      const totalPaid = parseFloat(invoice.total_paid_amount || 0);

      // ✅ Correct total before discount (matches CREATE logic)
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

        // ✅ Totals (FIXED)
        total_amount_before_adjustment: totalBeforeAdjustment.toFixed(2), // eg: 1520.00
        total_amount_after_adjustment: totalAfterAdjustment.toFixed(2),   // eg: 1444.00
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

/*const updateSalesInvoice = async (req, res) => {
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

    const status = header.status ?? invoice.status;

    // Validate products and stock
    await validateProducts(items, t);
    await validateProductItemDetails(items, t);


    // RECALCULATE TOTALS
    const { itemRows, subtotal, totalQty } = calculateItemsAndSubtotal(items);

    // Handle IGST vs SGST/CGST logic for header totals
    const { total, cgstAmt, sgstAmt, igstAmt, headerDiscountAmt, totalAdjustment, hasHeaderIgst } = calculateInvoiceTotals({ subtotal, header, adjustments });

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

    const { amountDue, refundAmount } = calculatePaymentSummary(allPayments, total);

    // === PAN CARD VALIDATION: Total CASH ≥ ₹2 Lakh ===
    validateCashPayment(allPayments);

    // 6. UPDATE INVOICE HEADER
    await invoice.update(
      {
        invoice_date: header.invoice_date || invoice.invoice_date,
        invoice_time: header.invoice_time || invoice.invoice_time,
        employee_id: header.employee_id,
        customer_id: header.customer_id,
        branch_id: header.branch_id,
        subtotal_amount: subtotal,
        cgst_percent: hasHeaderIgst ? null : (header.cgst_percent || null),
        sgst_percent: hasHeaderIgst ? null : (header.sgst_percent || null),
        igst_percent: hasHeaderIgst ? (header.igst_percent || null) : null,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        igst_amount: igstAmt,
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
      await reduceStockForInvoice(items, status, allPayments, t);

      // Lock adjustments
      await updateBillAdjustmentFlags(adjustments, t);
    }

    await t.commit();
    return commonService.okResponse(res, {
      message: "Invoice updated successfully",
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
};*/



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

    validateCashPayment(paymentRows);

    const hasHeaderIgst = header.igst_amount !== undefined && Number(header.igst_amount) > 0;
    const cgstAmt = hasHeaderIgst ? 0 : Number(header.cgst_amount || 0);
    const sgstAmt = hasHeaderIgst ? 0 : Number(header.sgst_amount || 0);
    const igstAmt = hasHeaderIgst ? Number(header.igst_amount || 0) : 0;

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

    await updateBillAdjustmentFlags(adjustments, t);

    // ITEMS (amounts already calculated by UI)
    const savedItems = await models.SalesInvoiceBillItem.bulkCreate(
      items.map(i => ({
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

    //Create Invoice - Status - Invoice	✅ Reduce stock
    //Create Hold Invoice	-	Status - On Hold	❌ No stock change
    //Create Invoice with amount due=0 - Status - Invoice	✅ Reduce stock
    //Create Invoice with amount due>0 - Status - Invoice	✅ Reduce stock    

    const shouldReduceStock = header.status === "Invoice" && savedPayments.length > 0 && Number(header.amount_due || 0) === 0;

    if (shouldReduceStock) {
      await reduceStockForInvoice(items, t);

      await bill.update(
        { stock_deducted: true },
        { transaction: t }
      );
    }

    if (estimateBill) {
      await markEstimateAsConverted(estimateBill, { transaction: t });
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

    const status = header.status ?? invoice.status;  
    const previousStatus = invoice.status; //onhold - hold - invoice
    const newStatus = status; // invoice   
    
    //const shouldReduceStock =  previousStatus !== "Invoice" && newStatus === "Invoice" && invoice.stock_deducted === false; // true for holded → invoice

    // Validate products and stock
    await validateProducts(items, t);
    await validateProductItemDetails(items, t);

    // Validate numbers are sane (no negatives, NaN)
    if (header.net_total < 0 || header.total_amount < 0) {
      throw new ValidationError("Invalid invoice totals");
    }

    // PAYMENT PROCESSING
    const incomingPayments = Array.isArray(payment) ? payment : [];

    // Fetch existing payments for cash validation
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

    // === PAN CARD VALIDATION: Total CASH ≥ ₹2 Lakh ===
    validateCashPayment(allPayments);

    // Determine IGST vs CGST/SGST
    const hasHeaderIgst = header.igst_amount !== undefined && Number(header.igst_amount) > 0;
    const cgstAmt = hasHeaderIgst ? 0 : Number(header.cgst_amount || 0);
    const sgstAmt = hasHeaderIgst ? 0 : Number(header.sgst_amount || 0);
    const igstAmt = hasHeaderIgst ? Number(header.igst_amount || 0) : 0;

    // UPDATE INVOICE HEADER (NO CALCULATION)
    await invoice.update(
      {
        invoice_date: header.invoice_date || invoice.invoice_date,
        invoice_time: header.invoice_time || invoice.invoice_time,
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
        status: status,
      },
      { transaction: t }
    );

    // UPSERT INVOICE ITEMS (amounts already calculated by UI)
    const payloadItemIds = items.filter(i => i.id).map(i => i.id);

    await models.SalesInvoiceBillItem.destroy({
      where: {
        invoice_bill_id: invoice.id,
        id: { [Op.notIn]: payloadItemIds.length > 0 ? payloadItemIds : [0] },
      },
      transaction: t,
    });

    for (const item of items) {
      if (item.id) {
        await models.SalesInvoiceBillItem.update(
          { ...item },
          { where: { id: item.id }, transaction: t }
        );
      } else {
        await models.SalesInvoiceBillItem.create(
          { ...item, invoice_bill_id: invoice.id },
          { transaction: t }
        );
      }
    }

    // UPSERT PAYMENTS
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

    // UPSERT ADJUSTMENTS
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

    // Update customer PAN
    if (req.body.customer?.pan_no && header.customer_id) {
      await models.Customer.update(
        { pan_no: req.body.customer.pan_no },
        { where: { id: header.customer_id }, transaction: t }
      );
    }

    // Update Holded Invoice	- Status - On Hold to Invoice	✅ Reduce stock
    // Update Invoice	- Status will always be Invoice	❌ No stock change
    // Update Invoice	when amountdue is 0 when create- Status - Invoice	✅ Reduce stock

    const hasPayment = allPayments.length > 0;
    const isFullyPaid = Number(header.amount_due ?? invoice.amount_due) === 0;
    const isInvoice = newStatus === "Invoice";

    const shouldReduceStock =
      isInvoice &&
      invoice.stock_deducted === false &&
      hasPayment &&
      isFullyPaid;

    if (shouldReduceStock) {
      await reduceStockForInvoice(items, t);

      await invoice.update(
        { stock_deducted: true },
        { transaction: t }
      );
    }

      // Lock adjustments
    await updateBillAdjustmentFlags(adjustments, t);

    await t.commit();
    return commonService.okResponse(res, {
      message: "Invoice updated successfully",
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

      WHERE i.deleted_at IS NULL
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


module.exports = {
  generateSalesInvoiceNo,
  createSalesInvoice,
  getSalesInvoiceById,
  listSalesInvoices,
  getSalesInvoicesByCustomerId,
  deleteSalesInvoice,
  searchInvoices,
  updateSalesInvoice
};
