const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");
const { ValidationError } = require("../utils/errors");
const { restoreStockForSalesReturn, validateDuplicateUniqueCode, applySalesReturnDeltas } = require('../helpers/billingValidations');

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

const createSalesReturn = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { header = {}, items = [] } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return commonService.badRequest(res, "At least one item is required");
    }

    await validateDuplicateUniqueCode({
      model: models.SalesReturn,
      billField: "sales_return_no",
      billValue: header.sales_return_no,
      employee_id: header.employee_id,
      transaction: t,
      bill_name: "Sales Return",
    });

    const itemRows = getReturnItemRows(items);

    await validateSalesReturnInvoices({
      items: itemRows,
      transaction: t,
    });

    const totalQty = itemRows.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    const hasHeaderIgst = Number(header.igst_amount || 0) > 0;
    const status = header.status || "Printed";

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

        cgst_percent: hasHeaderIgst ? null : (header.cgst_percent ?? null),
        sgst_percent: hasHeaderIgst ? null : (header.sgst_percent ?? null),
        igst_percent: hasHeaderIgst ? (header.igst_percent ?? null) : null,

        cgst_amount: hasHeaderIgst ? 0 : Number(header.cgst_amount || 0),
        sgst_amount: hasHeaderIgst ? 0 : Number(header.sgst_amount || 0),
        igst_amount: hasHeaderIgst ? Number(header.igst_amount || 0) : 0,

        total_amount: Number(header.total_amount || 0),
        total_quantity: totalQty,
        status,
      },
      { transaction: t }
    );

    const createdItems = await models.SalesReturnItem.bulkCreate(
      itemRows.map((item) => ({
        ...item,
        sales_return_id: salesReturn.id,
      })),
      {
        transaction: t,
        returning: true,
      }
    );

    // On Hold/Draft: no stock and no returned_quantity update.
    // Printed: quantities are added to stock and invoice returned_quantity is increased.
    await applySalesReturnDeltas({
      oldItems: [],
      newItems: createdItems,
      previousStatus: null,
      nextStatus: salesReturn.status,
      transaction: t,
    });

    await t.commit();

    return commonService.createdResponse(res, {
      sales_return: salesReturn,
      items: createdItems,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();

    if (err.name === "ValidationError") {
      return commonService.badRequest(res, err.message);
    }

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
      id,
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
    if (id) where += ` AND sr.id = :id`;
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
      id,
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
    const { customer_id, branch_id } = req.query;
    const where = { is_bill_adjusted: false, status: "Printed", };

    if (customer_id) {
      where.customer_id = customer_id;
    }

    if (branch_id) {
      where.branch_id = branch_id;
    }

    const rows = await models.SalesReturn.findAll({
      attributes: ["id", "sales_return_no", "customer_id"],
      where,
      order: [["sales_return_no", "ASC"]],
    });
    return commonService.okResponse(res, { sales_return_no: rows,});
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const updateSalesReturn = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const salesReturnId = req.params.id;
    const { header = {}, items = [] } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError("At least one item is required");
    }

    const salesReturn = await models.SalesReturn.findByPk(salesReturnId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!salesReturn) {
      return commonService.notFound(res, "Sales return not found");
    }

    if (salesReturn.status === "Cancelled") {
      throw new ValidationError("Cancelled sales return cannot be edited");
    }

    const previousStatus = salesReturn.status;
    const nextStatus = header.status ?? salesReturn.status;

    const existingItems = await models.SalesReturnItem.findAll({
      where: { sales_return_id: salesReturn.id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const existingItemMap = new Map(
      existingItems.map((item) => [Number(item.id), item])
    );

    const itemRows = getReturnItemRows(items);

    // Do not allow another sales return item's ID to be edited here.
    for (const row of itemRows) {
      if (row.id && !existingItemMap.has(Number(row.id))) {
        throw new ValidationError("Invalid sales return item ID");
      }
    }

    await validateSalesReturnInvoices({
      items: itemRows,
      transaction: t,
    });

    const totalQty = itemRows.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    const hasHeaderIgst = Number(header.igst_amount || 0) > 0;

    /*
      Apply stock / returned-quantity difference BEFORE changing item rows.

      On Hold → Printed: old applied qty = 0, new applied qty = all lines.
      Printed → On Hold/Cancelled: new applied qty = 0, reverses all lines.
      Printed → Printed: applies only the quantity difference.
      Removing a line: new quantity becomes 0, reverses that line.
    */
    await applySalesReturnDeltas({
      oldItems: existingItems,
      newItems: itemRows,
      previousStatus,
      nextStatus,
      transaction: t,
    });

    await salesReturn.update(
      {
        sales_return_no: header.sales_return_no ?? salesReturn.sales_return_no,
        return_date: header.return_date ?? salesReturn.return_date,
        return_time: header.return_time ?? salesReturn.return_time,
        employee_id: header.employee_id ?? salesReturn.employee_id,
        customer_id: header.customer_id ?? salesReturn.customer_id,
        branch_id: header.branch_id ?? salesReturn.branch_id,

        subtotal_amount: Number(header.subtotal_amount || 0),
        discount_type: header.discount_type ?? salesReturn.discount_type,
        discount_amount: Number(header.discount_amount || 0),
        discount_calculated: Number(header.discount_calculated || 0),

        cgst_percent: hasHeaderIgst ? null : (header.cgst_percent ?? null),
        sgst_percent: hasHeaderIgst ? null : (header.sgst_percent ?? null),
        igst_percent: hasHeaderIgst ? (header.igst_percent ?? null) : null,

        cgst_amount: hasHeaderIgst ? 0 : Number(header.cgst_amount || 0),
        sgst_amount: hasHeaderIgst ? 0 : Number(header.sgst_amount || 0),
        igst_amount: hasHeaderIgst ? Number(header.igst_amount || 0) : 0,

        total_amount: Number(header.total_amount || 0),
        total_quantity: totalQty,
        status: nextStatus,
      },
      { transaction: t }
    );

    const payloadIds = itemRows
      .filter((item) => item.id)
      .map((item) => Number(item.id));

    // Soft-delete lines removed from the UI.
    for (const existingItem of existingItems) {
      if (!payloadIds.includes(Number(existingItem.id))) {
        await existingItem.destroy({ transaction: t });
      }
    }

    for (const row of itemRows) {
      if (row.id) {
        const existingItem = existingItemMap.get(Number(row.id));

        await existingItem.update(
          {
            ...row,
            id: undefined,
          },
          { transaction: t }
        );
      } else {
        await models.SalesReturnItem.create(
          {
            ...row,
            sales_return_id: salesReturn.id,
          },
          { transaction: t }
        );
      }
    }

    await t.commit();

    return commonService.okResponse(res, {
      message: "Sales return updated successfully",
    });
  } catch (err) {
    if (!t.finished) await t.rollback();

    if (err.name === "ValidationError") {
      return commonService.badRequest(res, err.message);
    }

    return commonService.handleError(res, err);
  }
};

const validateSalesReturnInvoices = async ({ items, transaction }) => {
  for (const item of items) {
    if (!item.invoice_id || !item.invoice_no) {
      throw new ValidationError(
        "invoice_id and invoice_no are required for every return item"
      );
    }

    if (!item.invoice_bill_item_id) {
      throw new ValidationError(
        "invoice_bill_item_id is required for every return item"
      );
    }

    if (!item.product_id || !item.product_item_detail_id) {
      throw new ValidationError(
        "product_id and product_item_detail_id are required for every return item"
      );
    }

    if (Number(item.quantity) <= 0) {
      throw new ValidationError("Return quantity must be greater than zero");
    }

    const invoice = await models.SalesInvoiceBill.findOne({
      where: {
        id: item.invoice_id,
        invoice_no: item.invoice_no,
        status: "Invoice",
        deleted_at: null,
      },
      transaction,
    });

    if (!invoice) {
      throw new ValidationError(
        `Invalid invoice ${item.invoice_no}; it was not found or is not finalized`
      );
    }

    const invoiceItem = await models.SalesInvoiceBillItem.findOne({
      where: {
        id: item.invoice_bill_item_id,
        invoice_bill_id: item.invoice_id,
        product_id: item.product_id,
        product_item_detail_id: item.product_item_detail_id,
        deleted_at: null,
      },
      transaction,
    });

    if (!invoiceItem) {
      throw new ValidationError(
        `Invoice item ${item.invoice_bill_item_id} does not belong to invoice ${item.invoice_no}`
      );
    }
  }
};

const getReturnItemRows = (items) =>
  items.map((it) => {
    const hasIgst = Number(it.igst_amount || 0) > 0;

    return {
      id: it.id || null,
      invoice_id: it.invoice_id,
      invoice_no: it.invoice_no || null,
      invoice_date: it.invoice_date || null,
      invoice_bill_item_id: it.invoice_bill_item_id,

      product_id: it.product_id,
      product_item_detail_id: it.product_item_detail_id || null,
      sku_id: it.sku_id || null,
      product_description: it.product_description || null,
      net_weight: it.net_weight || null,
      gross_weight: it.gross_weight || null,

      quantity: Number(it.quantity || 0),
      rate: Number(it.rate || 0),
      amount: Number(it.amount || 0),

      cgst_percent: hasIgst ? null : (it.cgst_percent ?? null),
      sgst_percent: hasIgst ? null : (it.sgst_percent ?? null),
      cgst_amount: hasIgst ? 0 : Number(it.cgst_amount || 0),
      sgst_amount: hasIgst ? 0 : Number(it.sgst_amount || 0),

      igst_percent: hasIgst ? (it.igst_percent ?? null) : null,
      igst_amount: hasIgst ? Number(it.igst_amount || 0) : 0,
    };
});

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
