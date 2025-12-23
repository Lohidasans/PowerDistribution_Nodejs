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
    const { header = {}, items = [], payment = {}, adjustments = [] } = req.body || {};
    
    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(res, "At least one item is required");
    }

    // Check if a non-deleted invoice already uses this code
    if (header.invoice_no) {
      const existing = await models.SalesInvoiceBill.findOne({
        where: {
          invoice_no: header.invoice_no,
          deleted_at: null,     // only check active (non-deleted) records
        },
      });

      if (existing) {
        return commonService.badRequest(res, { message: "Invoice no already exists" });
      }
    }

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

    // Get tax amounts (assuming these are already calculated as fixed amounts)
    const cgstAmt = Number(header.cgst_amount ?? 0);
    const sgstAmt = Number(header.sgst_amount ?? 0);

    // Apply header-level discount if any
    let headerDiscountAmt = 0;
    if (header.discount_amount && header.discount_amount > 0) {
      if (header.discount_type === "Percentage") {
        headerDiscountAmt = (subtotal * Number(header.discount_amount)) / 100;
      } else {
        headerDiscountAmt = Number(header.discount_amount);
      }
      // Ensure header discount doesn't make subtotal negative
      headerDiscountAmt = Math.min(headerDiscountAmt, subtotal);
    }

    // Calculate final total before adjustment
    const taxableAmount = subtotal - headerDiscountAmt;
    let total = taxableAmount + cgstAmt + sgstAmt;

    // APPLY MULTIPLE BILL ADJUSTMENTS
    let totalAdjustment = 0;
    if (Array.isArray(adjustments) && adjustments.length > 0) {
      totalAdjustment = adjustments.reduce((sum, adj) => {
        return sum + (Number(adj.adjustment_amount) || 0);
      }, 0);

      // Calculate the maximum allowed adjustment (total before adjustment)
      const maxAllowedAdjustment = total; // This is the total before any adjustments

      if (totalAdjustment > maxAllowedAdjustment) {
        await t.rollback();
        return commonService.badRequest(res, {
          message: "Total adjustment amount cannot exceed the invoice total",
          maxAllowedAdjustment,
          attemptedAdjustment: totalAdjustment
        });
      }

      // Subtract total adjustment
      total -= totalAdjustment;

      // Prevent negative totals
      if (total < 0) total = 0;
    }

    // Validate payment for high-value transactions
    if (total > 200000) {
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
        discount_type: header.discount_type || null,
        discount_amount: headerDiscountAmt,
        total_amount: total,
        amount_due: header.amount_due,
        total_quantity: totalQty,
        hasBillAdjustment: header.hasBillAdjustment || false,
        status: header.status || "Draft",
        created_by: req.user?.id || null,
      },
      { transaction: t }
    );

    // INSERT MULTIPLE ADJUSTMENT ENTRIES (only if exists)
    let savedAdjustments = [];
    if (Array.isArray(adjustments) && adjustments.length > 0) {
      const adjustmentRows = adjustments.map(adj => ({
        sales_invoice_id: bill.id,
        adjustment_type_id: adj.adjustment_type_id,
        reference_id: adj.reference_id,
        reference_no: adj.reference_no,
        adjustment_amount: Number(adj.adjustment_amount) || 0,
      }));

      savedAdjustments = await models.SalesInvoiceAdjustment.bulkCreate(
        adjustmentRows,
        { transaction: t }
      );

      // Update is_bill_adjusted flag for each adjustment
      for (const adj of adjustments) {
        if (adj.reference_id) {
          if (adj.adjustment_type_id === 1) { // Sales Return
            await models.SalesReturn.update(
              { is_bill_adjusted: true },
              {
                where: { id: adj.reference_id },
                transaction: t
              }
            );
          }
          else if (adj.adjustment_type_id === 2) { // Old Jewel
            await models.OldJewel.update(
              { is_bill_adjusted: true },
              {
                where: { id: adj.reference_id },
                transaction: t
              }
            );
          }
        }
      }
    }

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
      // Reduce stock quantities
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
              `Product item detail not found for ID: ${item.product_item_detail_id}`
            );
          }

          const newQuantity = productItemDetail.quantity - item.quantity;

          if (newQuantity < 0) {
            await t.rollback();
            return commonService.badRequest(
              res,
              `Insufficient stock for product item detail ID: ${item.product_item_detail_id}`
            );
          }

          await productItemDetail.update(
            { quantity: newQuantity },
            { transaction: t }
          );
        }
      }
    }

    await t.commit();
    return commonService.createdResponse(res, { 
      message: enMessage.billing.invoiceCreationSuccess,
      invoice: bill,
      items: withFK,
      payments: paymentRows,
      adjustment: savedAdjustments
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

// List invoices - bill page/ customer - order details page
const listSalesInvoices = async (req, res) => {
  try {
    const { from, to, invoice_no, employee_id,  customer_id, branch_id,  order_type, search } = req.query || {};

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
          ) AS items,
          SUM(quantity) AS total_quantity,
          SUM(amount) AS total_amount
        FROM sales_invoice_bill_items
        WHERE deleted_at IS NULL
        GROUP BY invoice_bill_id
      ),
      invoice_adjustment AS (
        SELECT
          sia.sales_invoice_id,
          JSON_BUILD_OBJECT(
            'adjustment_type_id', sia.adjustment_type_id,
            'adjustment_type_name', bat.type_name,
            'reference_id', sia.reference_id,
            'reference_no', sia.reference_no,
            'adjustment_amount', sia.adjustment_amount
          ) AS adjustment
        FROM sales_invoice_adjustments sia
        LEFT JOIN bill_adjustment_types bat ON bat.id = CAST(sia.adjustment_type_id AS INTEGER)
        WHERE sia.deleted_at IS NULL
      )
      SELECT
        i.*,

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

        -- Adjustment
        ia.adjustment AS bill_adjustment

      FROM sales_invoice_bills i

      -- Customer joins
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN districts d ON d.id = c.district_id
      LEFT JOIN states s ON s.id = c.state_id
      LEFT JOIN countries ct ON ct.id = c.country_id

      -- Branch joins
      LEFT JOIN branches b ON b.id = i.branch_id
      LEFT JOIN districts bd ON bd.id = b.district_id
      LEFT JOIN states bs ON bs.id = b.state_id

      -- Aggregates
      LEFT JOIN invoice_items ii ON ii.invoice_bill_id = i.id
      LEFT JOIN invoice_adjustment ia ON ia.sales_invoice_id = i.id

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

    const [invoices] = await sequelize.query(sql, { replacements });

    // Final formatting
    const formattedInvoices = invoices.map((invoice) => {
      const amountDue = parseFloat(invoice.total_amount || 0) - parseFloat(invoice.total_paid_amount || 0);

      return {
        ...invoice,
        amount_due: amountDue.toFixed(2),
      };
    });

    return commonService.okResponse(res, {
      invoices: formattedInvoices,
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
