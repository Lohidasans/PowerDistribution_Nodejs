const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");
const { restoreStockForSalesReturn, validateDuplicateUniqueCode } = require('../helpers/billingValidations');

// Generate sales return number (series)
const generateSalesReturnNo = async (req, res) => {
  try {
    const { prefix = "SR" } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.SalesReturn,
      "sales_return_no",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { sales_return_no: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Create sales return (header + items)
const createSalesReturn = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { header = {}, items = [] } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(res, "At least one item is required");
    }

    // CHECK DUPLICATE
    const employee = await validateDuplicateUniqueCode({
      model: models.SalesReturn,
      billField: "sales_return_no",
      billValue: header.sales_return_no,
      employee_id: header.employee_id,
      transaction: t,
      bill_name: "Sales Return",
    });
    
    // VALIDATION OF INVOICES & ITEMS
    const isValid = await validateSalesReturnInvoices({
      items,
      transaction: t,
      models,
      res,
      commonService,
    });

    if (isValid !== true) return; // response already sent

    // USE UI VALUES DIRECTLY
    let totalQty = 0;

    const itemRows = items.map((it) => {
      const qty = Number(it.quantity || 0);
      totalQty += qty;
      const hasIgst = it.igst_amount &&  Number(it.igst_amount) > 0;

      return {
        product_id: it.product_id,
        product_item_detail_id: it.product_item_detail_id || null,
        sku_id: it.sku_id || null,
        product_description: it.product_description || null,
        net_weight: it.net_weight || null,
        gross_weight: it.gross_weight || null,
        quantity: qty,
        rate: Number(it.rate || 0),
        amount: Number(it.amount || 0),
        cgst_percent: hasIgst ? null : (it.cgst_percent ?? null),
        sgst_percent: hasIgst ? null : (it.sgst_percent ?? null),
        cgst_amount: hasIgst  ? 0 : Number(it.cgst_amount || 0),
        sgst_amount: hasIgst  ? 0 : Number(it.sgst_amount || 0),
        igst_percent: hasIgst ? (it.igst_percent ?? null) : null,
        igst_amount: hasIgst ? Number(it.igst_amount || 0) : 0,
        invoice_date: it.invoice_date || null,
        invoice_id: it.invoice_id,
        invoice_no: it.invoice_no || null,
      };
    });

   const hasHeaderIgst =
      header.igst_amount &&
      Number(header.igst_amount) > 0;

    const salesReturn = await models.SalesReturn.create(
      {
        sales_return_no: header.sales_return_no,
        return_date: header.return_date || new Date(),
        return_time: header.return_time || null,
        employee_id: header.employee_id,
        customer_id: header.customer_id || null,
        branch_id: header.branch_id || null,
        subtotal_amount: Number(header.subtotal_amount || 0),
        discount_type: header.discount_type || null,
        discount_amount: Number(header.discount_amount || 0),
        discount_calculated: Number(header.discount_calculated || 0),
        cgst_percent: hasHeaderIgst ? null : (header.cgst_percent || null),
        sgst_percent: hasHeaderIgst ? null : (header.sgst_percent || null),
        igst_percent: hasHeaderIgst ? (header.igst_percent || null) : null,
        cgst_amount: hasHeaderIgst ? 0 : Number(header.cgst_amount || 0),
        sgst_amount: hasHeaderIgst ? 0 : Number(header.sgst_amount || 0),
        igst_amount: hasHeaderIgst ? Number(header.igst_amount || 0): 0,
        total_amount: Number(header.total_amount || 0),
        total_quantity: totalQty,
        status: header.status || "Printed",
      },
      { transaction: t }
    );

    // Create sales return items
    const withFK = itemRows.map((row) => ({
      ...row,
      sales_return_id: salesReturn.id,
    }));

    const createdItems = await models.SalesReturnItem.bulkCreate(withFK, {
      transaction: t,
      returning: true,
    });

    // === UPDATE ORIGINAL INVOICE ITEMS: is_returned = true (per item) ===
    if (header.status !== "On Hold") {
      for (const item of createdItems) {
      if (item.invoice_id && item.product_item_detail_id) {
        await models.SalesInvoiceBillItem.update(
          { is_returned: true },
          {
            where: {
              invoice_bill_id: item.invoice_id,
              product_item_detail_id: item.product_item_detail_id,
            },
            transaction: t,
          });
        }
      }   
    }

    // 🔺 RESTORE STOCK (ONLY IF FINALIZED)
    if (salesReturn.status !== "On Hold") {
      await restoreStockForSalesReturn(createdItems, t);
    }

    // === END UPDATE ===
    await t.commit();

    return commonService.createdResponse(res, {
      sales_return: salesReturn,
      items: createdItems,
    });
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Get sales return by id
const getSalesReturnById = async (req, res) => {
  try {
    const id = req.params.id;
    const salesReturn = await models.SalesReturn.findByPk(id);
    
    if (!salesReturn) {
      return commonService.notFound(res, enMessage.failure.notFound);
    }
    
    const items = await models.SalesReturnItem.findAll({ 
      where: { sales_return_id: id } 
    });
    
    return commonService.okResponse(res, { 
      sales_return: salesReturn, 
      items 
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List sales returns with filters
const listSalesReturns = async (req, res) => {
  try {
    const {
      page,
      limit,
      status,
      customer_id,
      start_date,
      end_date,
      branch_id,
      sales_return_no,
      search
    } = req.query;

    const hasPagination = page !== undefined;
    const offset = hasPagination
      ? (parseInt(page) - 1) * parseInt(limit)
      : null;

    let where = `WHERE sr.deleted_at IS NULL`;

    if (status) where += ` AND sr.status = :status`;
    if (customer_id) where += ` AND sr.customer_id = :customer_id`;
    if (branch_id) where += ` AND sr.branch_id = :branch_id`;
    if (start_date) where += ` AND sr.return_date >= :start_date`;
    if (end_date) where += ` AND sr.return_date <= :end_date`;
    if (sales_return_no)
      where += ` AND sr.sales_return_no ILIKE :sales_return_no`;

    if (search) {
      where += `
        AND (
          sr.sales_return_no ILIKE :search
          OR c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
          OR b.branch_name ILIKE :search
        )
      `;
    }

    const replacements = {
      status,
      customer_id,
      branch_id,
      start_date,
      end_date,
      sales_return_no: sales_return_no ? `%${sales_return_no}%` : undefined,
      search: search ? `%${search}%` : undefined
    };

    // Count
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM sales_returns sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      LEFT JOIN branches b ON sr.branch_id = b.id
      ${where};
    `;

    const [{ total }] = await sequelize.query(countQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Data
    let dataQuery = `
      SELECT 
        sr.*,
        c.customer_name,
        c.mobile_number AS customer_mobile,
        e.employee_name,
        b.branch_name
      FROM sales_returns sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      LEFT JOIN employees e ON sr.employee_id = e.id
      LEFT JOIN branches b ON sr.branch_id = b.id
      ${where}
      ORDER BY sr.return_date DESC, sr.id DESC
    `;

    if (hasPagination) {
      dataQuery += ` LIMIT :limit OFFSET :offset`;
      replacements.limit = parseInt(limit);
      replacements.offset = offset;
    }

    const data = await sequelize.query(dataQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // ---------- ITEMS ----------
    const salesReturnIds = data.map(d => d.id);
    let itemsMap = {};

    if (salesReturnIds.length) {
      const itemsQuery = `
      SELECT sri.*, p.product_name,
        --Product Item SKU
        pid.sku_id AS product_item_sku_id,

        --Product SKU
        p.sku_id AS product_sku_id

        FROM sales_return_items sri
        LEFT JOIN "productItemDetails" pid ON pid.id = sri.product_item_detail_id
        LEFT JOIN products p
          ON p.id = pid.product_id
          AND p.deleted_at IS NULL
        WHERE sri.sales_return_id IN (:ids)
          AND sri.deleted_at IS NULL

        ORDER BY sri.sales_return_id;
      `;

      const items = await sequelize.query(itemsQuery, {
        replacements: { ids: salesReturnIds },
        type: sequelize.QueryTypes.SELECT
      });

      items.forEach(it => {
        (itemsMap[it.sales_return_id] ??= []).push(it);
      });
    }

    // Attach items to each sales return
    const finalData = data.map(d => {
      const items = itemsMap[d.id] || [];
      const total_net_weight = items.reduce(
        (sum, it) => sum + (parseFloat(it.net_weight) || 0),
        0
      );

      return {
        ...d,
        total_net_weight,
        items
      };
    });

    return commonService.okResponse(res, {
      total,
      page: hasPagination ? parseInt(page) : null,
      total_pages: hasPagination ? Math.ceil(total / limit) : 1,
      data: finalData
    });

  } catch (err) {
    console.error("listSalesReturns error:", err);
    return commonService.handleError(res, err);
  }
};

// Delete sales return (soft delete)
const deleteSalesReturn = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    
    // Delete associated items first
    await models.SalesReturnItem.destroy({
      where: { sales_return_id: id },
      transaction: t
    });
    
    // Delete the sales return
    const deleted = await models.SalesReturn.destroy({
      where: { id },
      transaction: t
    });

    if (!deleted) {
      await t.rollback();
      return commonService.notFound(res, enMessage.failure.notFound);
    }

    await t.commit();
    return commonService.noContentResponse(res);
  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

// Dropdown: listSalesReturnDropdown -> [{ id, sales_return_no }]
const listSalesReturnDropdown = async (req, res) => {
  try {
    const { customer_id } = req.query;
    const where = { is_bill_adjusted: false, status: "Printed", };

    if (customer_id) {
      where.customer_id = customer_id; // apply filter only if passed
    }

    const rows = await models.SalesReturn.findAll({
      attributes: ["id", "sales_return_no", "customer_id"],
      where,
      order: [["sales_return_no", "ASC"]],
    });
    return commonService.okResponse(res, { sales_return_no: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateSalesReturn = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const salesReturnId = req.params.id;
    const { header = {}, items = [] } = req.body || {};

    // 1. FETCH & VALIDATE SALES RETURN
    const salesReturn = await models.SalesReturn.findByPk(salesReturnId, {
      transaction: t
    });

    if (!salesReturn) {
      await t.rollback();
      return commonService.notFound(res, "Sales return not found");
    }

    const previousStatus = salesReturn.status;

    // On hold - stock not added
    // Printed - stock added
    // If changing from On Hold to Printed - add stock for all items

    // 2. ITEMS VALIDATION
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "At least one item is required"
      );
    }

    if (salesReturn.status === "Cancelled") {
      await t.rollback();
      return commonService.badRequest(
        res,
        "Cancelled sales return cannot be edited"
      );
    }

    // INVOICE + ITEM VALIDATION
    const valid = await validateSalesReturnInvoices({
      items,
      transaction: t,
      models,
      res,
      commonService,
    });

    if (valid !== true) return;

    // 3. USE UI CALCULATED VALUES DIRECTLY
    const itemRows = items.map((it) => ({
      id: it.id || null,
      product_id: it.product_id,
      product_item_detail_id: it.product_item_detail_id,
      sku_id: it.sku_id || null,
      product_description: it.product_description || null,
      net_weight: it.net_weight || null,
      gross_weight: it.gross_weight || null,
      quantity: Number(it.quantity || 0),
      rate: Number(it.rate || 0),
      amount: Number(it.amount || 0),
      cgst_percent: it.cgst_percent ?? null,
      sgst_percent: it.sgst_percent ?? null,
      igst_percent: it.igst_percent ?? null,
      cgst_amount: Number(it.cgst_amount || 0),
      sgst_amount: Number(it.sgst_amount || 0),
      igst_amount: Number(it.igst_amount || 0),
    }));

    const subtotal = Number(header.subtotal_amount || 0);
    const totalQty = Number(header.total_quantity || 0);
    const total = Number(header.total_amount || 0);

    // 4. UPDATE SALES RETURN HEADER
    await salesReturn.update(
      {
        sales_return_no: header.sales_return_no ?? salesReturn.sales_return_no,
        return_date: header.return_date || salesReturn.return_date,
        return_time: header.return_time || salesReturn.return_time,
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
        total_amount: total,
        total_quantity: totalQty,
        status: header.status
      },
      { transaction: t }
    );

    // Update Existing items
    const existingItems = await models.SalesReturnItem.findAll({
      where: { sales_return_id: salesReturn.id },
      transaction: t
    });

    const payloadItemIds = itemRows
      .filter(i => i.id)
      .map(i => i.id);

    // DELETE omitted items
    await models.SalesReturnItem.destroy({
      where: {
        sales_return_id: salesReturn.id,
        id: { [Op.notIn]: payloadItemIds }
      },
      transaction: t
    });

    // UPSERT items
    for (const row of itemRows) {
      if (row.id) {
        await models.SalesReturnItem.update(
          {
            product_id: row.product_id,
            product_item_detail_id: row.product_item_detail_id,
            sku_id: row.sku_id,
            product_description: row.product_description,
            net_weight: row.net_weight,
            gross_weight: row.gross_weight,
            quantity: row.quantity,
            rate: row.rate,
            amount: row.amount,
            cgst_percent: row.cgst_percent,
            sgst_percent: row.sgst_percent,
            igst_percent: row.igst_percent,
            cgst_amount: row.cgst_amount,
            sgst_amount: row.sgst_amount,
            igst_amount: row.igst_amount,
          },
          {
            where: { id: row.id },
            transaction: t
          }
        );
      } else {
        await models.SalesReturnItem.create(
          {
            ...row,
            sales_return_id: salesReturn.id
          },
          { transaction: t }
        );
      }
    }

    // === UPDATE ORIGINAL INVOICE ITEMS IF STATUS CHANGED TO PRINTED ===
    if (header.status === "Printed") {
      for (const row of items) {
      if (row.invoice_id && row.product_item_detail_id) {
        await models.SalesInvoiceBillItem.update(
          { is_returned: true },
          {
            where: {
              invoice_bill_id: row.invoice_id,
              product_item_detail_id: row.product_item_detail_id,
            },
            transaction: t,
          });
        }
      }
    }

    // 🔺 RESTORE STOCK WHEN FINALIZING HOLD RETURN
    if (previousStatus === "On Hold" && header.status === "Printed") {
      const finalItems = await models.SalesReturnItem.findAll({
        where: { sales_return_id: salesReturn.id },
        transaction: t,
      });

      await restoreStockForSalesReturn(finalItems, t);
    }

    // 🔺 RESTORE STOCK ONLY FOR NEW ITEMS WHEN EDITING PRINTED RETURN
    if (previousStatus === "Printed" && header.status === "Printed") {

      const existingItems = await models.SalesReturnItem.findAll({
        where: { sales_return_id: salesReturn.id },
        transaction: t
      });

      const existingIds = existingItems.map(i => i.id);

      const newItems = itemRows.filter(i => !existingIds.includes(i.id));

      if (newItems.length) {
        await restoreStockForSalesReturn(newItems, t);
      }
    }

    await t.commit();
    return commonService.okResponse(res, {
      message: "Sales return updated successfully"
    });

  } catch (err) {
    await t.rollback();
    return commonService.handleError(res, err);
  }
};

const validateSalesReturnInvoices = async ({
  items,
  transaction,
  models,
  res,
  commonService,
}) => {
  for (const it of items) {
    if (!it.invoice_no) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "invoice_no is required for all return items"
      );
    }

    const invoice = await models.SalesInvoiceBill.findOne({
      where: {
        id: it.invoice_id,
        invoice_no: it.invoice_no,
        status: "Invoice",
        deleted_at: null,
      },
      transaction,
    });

    if (!invoice) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        `Invalid invoice_no ${it.invoice_no}. Invoice not found or not in Invoice status`
      );
    }

    if (!it.product_id || !it.product_item_detail_id) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "product_id and product_item_detail_id are required for sales return"
      );
    }

    const invoiceItem = await models.SalesInvoiceBillItem.findOne({
      where: {
        invoice_bill_id: invoice.id,
        product_id: it.product_id,
        product_item_detail_id: it.product_item_detail_id,
        deleted_at: null,
      },
      transaction,
    });

    if (!invoiceItem) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        `Item not found in invoice ${it.invoice_no} for product_id ${it.product_id} and product_item_detail_id ${it.product_item_detail_id}`
      );
    }

    if (invoiceItem.is_returned) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        `Item already returned for invoice ${it.invoice_no}`
      );
    }
  }

  return true;
};


// Toggle active status for sales return
const toggleSalesReturnActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return commonService.badRequest(res, "is_active must be a boolean value");
    }

    const salesReturn = await models.SalesReturn.findByPk(id);
    if (!salesReturn) {
      return commonService.notFound(res, "Sales return not found");
    }

    await salesReturn.update({ is_active });

    return commonService.okResponse(res, {
      message: "Sales return active status updated successfully",
      is_active
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  generateSalesReturnNo,
  createSalesReturn,
  getSalesReturnById,
  listSalesReturns,
  deleteSalesReturn,
  listSalesReturnDropdown,
  updateSalesReturn,
  validateSalesReturnInvoices,
  toggleSalesReturnActive
};
