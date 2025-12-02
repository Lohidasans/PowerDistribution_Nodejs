const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
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
    const { header = {}, items = [], payment = {} } = req.body || {};
    
    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(res, "At least one item is required");
    }

    // Calculate totals
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
        quantity: qty,
        rate,
        discount_amount: it.discount_amount ?? 0,
        amount,
      };
    });

    const cgstAmt = Number(header.cgst_amount ?? 0);
    const sgstAmt = Number(header.sgst_amount ?? 0);
    const discountAmt = Number(header.discount_amount ?? 0);
    const total = subtotal - discountAmt + cgstAmt + sgstAmt;

    // Validate payment for high-value transactions
    if (total > 200000) {
      // if (!payment.payment_mode) {
      //   await t.rollback();
      //   return commonService.badRequest(res, "Payment mode is required for orders above ₹2,00,000");
      // }
      
      if (payment.payment_mode === 'Cash') {
        await t.rollback();
        return commonService.badRequest(res, enMessage.billing.panCardRequired);
      }
    }

    // Create invoice
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
        amount_due: header.amount_due,
        total_quantity: totalQty,
        hasBillAdjustment: header.hasBillAdjustment || false,
        status: header.status || "Draft",
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    // Create invoice items
    const withFK = itemRows.map((row) => ({ ...row, invoice_bill_id: bill.id }));
    await models.SalesInvoiceBillItem.bulkCreate(withFK, { transaction: t });

    // Update customer PAN if provided
    if (req.body.customer?.pan_no && header.customer_id) {
      await models.Customer.update(
        { pan_no: req.body.customer.pan_no },
        { where: { id: header.customer_id }, transaction: t }
      );
    }

    // Create payments if array is provided
    const paymentRows = (payment || [])
      .filter(p => p.payment_mode) // ignore any empty objects
      .map(p => ({
        invoice_bill_id: bill.id,
        payment_mode: p.payment_mode,
        amount_received: p.amount_received,
        payment_date: p.payment_date || new Date(),
        transaction_id: p.transaction_id || null,
        status: "Completed",
        created_by: req.user?.id || null,
      }));

    if (paymentRows.length > 0) {
      await models.Payment.bulkCreate(paymentRows, { transaction: t });
    }

    await t.commit();
    return commonService.createdResponse(res, { 
      message: enMessage.billing.invoiceCreationSuccess,
      invoice: bill,
      items: withFK,
      payments: paymentRows
    });
  } catch (err) {
    await t.rollback();
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
    const [items, payment, customer, branch] = await Promise.all([
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
      payment: payment || null,
      items: items || []
    };

    return commonService.okResponse(res, response);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List invoices - bill page/ customer scheme details page
const listSalesInvoices = async (req, res) => {
  try {
    const { from, to, employee_id, customer_id, search } = req.query || {};

    let sql = `
      WITH invoice_items AS (
        SELECT 
          invoice_bill_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', id,
              'product_name_snapshot', product_name_snapshot,
              'quantity', quantity,
              'rate', rate,
              'amount', amount
            )
          ) as items,
          SUM(quantity) as total_quantity,
          SUM(amount) as total_amount
        FROM sales_invoice_bill_items
        WHERE deleted_at IS NULL
        GROUP BY invoice_bill_id
      )
      SELECT
        i.*,
        -- Customer details
        c.customer_name,
        c.address AS customer_address,
        c.mobile_number as customer_mobile_number,
        c.pin_code as customer_pincode,
        c.pan_no as customer_pan_no,
        ct.country_name as customer_country_name,
        d.district_name as customer_district_name,
        s.state_name as customer_state_name,
        -- Branch details
        b.branch_name,
        b.address AS branch_address,
        b.mobile as branch_mobile_number,
        b.pin_code as branch_pincode,
        bd.district_name as branch_district_name,
        bs.state_name as branch_state_name,
        -- Item totals
        COALESCE(ii.items, '[]'::json) as invoice_items,
        COALESCE(ii.total_quantity, 0) as total_items_quantity,
        COALESCE(ii.total_amount, 0) as total_items_amount
      FROM "sales_invoice_bills" i
      -- Customer joins
      LEFT JOIN "customers" c ON c.id = i.customer_id
      LEFT JOIN "districts" d ON d.id = c.district_id
      LEFT JOIN "states" s ON s.id = c.state_id
      LEFT JOIN "countries" ct ON ct.id = c.country_id
      -- Branch joins
      LEFT JOIN "branches" b ON b.id = i.branch_id
      LEFT JOIN "districts" bd ON bd.id = b.district_id
      LEFT JOIN "states" bs ON bs.id = b.state_id
      -- Invoice items
      LEFT JOIN invoice_items ii ON ii.invoice_bill_id = i.id
      -- Invoice payments
      --LEFT JOIN invoice_payments ip ON ip.invoice_bill_id = i.id
      WHERE i.deleted_at IS NULL
    `;

    const replacements = {};
    if (from) { sql += ` AND i.invoice_date >= :from`; replacements.from = from; }
    if (to) { sql += ` AND i.invoice_date <= :to`; replacements.to = to; }
    if (employee_id) { sql += ` AND i.employee_id = :employee_id`; replacements.employee_id = employee_id; }
    if (customer_id) { sql += ` AND i.customer_id = :customer_id`; replacements.customer_id = customer_id; }
    if (search) {
      sql += ` AND (
        i.invoice_no ILIKE :search OR
        c.customer_name ILIKE :search OR
        c.mobile_number ILIKE :search
      )`;
      replacements.search = `%${search}%`;
    }

    sql += ` ORDER BY i.created_at DESC`;

    const [invoices] = await sequelize.query(sql, { replacements });

    // Process the results to format the response
    const formattedInvoices = invoices.map(invoice => {
      // Calculate amount due
      const amountDue = parseFloat(invoice.total_amount) - parseFloat(invoice.total_paid_amount || 0);

      return {
        ...invoice,
        amount_due: amountDue.toFixed(2),
        // Add any additional formatting here
      };
    });

    return commonService.okResponse(res, { invoices: formattedInvoices });
  } catch (err) {
    console.error('Error in listSalesInvoices:', err);
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
    const { invoice_no, mobile_number } = req.query;

    if (!invoice_no && !mobile_number) {
      return commonService.badRequest(res, 'Either invoice number or mobile number is required');
    }

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

      // If no customers found with this mobile number
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

    // Add customer IDs to where condition if mobile number was provided
    if (customerIds.length > 0) {
      whereCondition.customer_id = {
        [Op.in]: customerIds
      };
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
        models.SalesInvoiceBillItem.findAll({
          where: { invoice_bill_id: invoice.id },
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

    return commonService.okResponse(res, {
      count: result.length,
      invoices: result
    });
  } catch (error) {
    console.error('Error searching invoices:', error);
    return commonService.handleError(res, error);
  }
};


module.exports = {
  generateSalesInvoiceNo,
  createSalesInvoice,
  getSalesInvoiceById,
  listSalesInvoices,
  deleteSalesInvoice,
  searchInvoices,
};
