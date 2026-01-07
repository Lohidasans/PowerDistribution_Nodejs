const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { Op } = require("sequelize");

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
        product_item_detail_id: it.product_item_detail_id || null,
        sku_id: it.sku_id || null,
        hsn_code: it.hsn_code || null,
        product_description: it.product_description || null,
        net_weight: it.net_weight || null,
        gross_weight: it.gross_weight || null,
        quantity: qty,
        rate,
        amount,
        invoice_date: it.invoice_date || null,
        invoice_no: it.invoice_no || null,
      };
    });

    const cgstAmt = Number(header.cgst_amount || 0);
    const sgstAmt = Number(header.sgst_amount || 0);
    const total = subtotal + cgstAmt + sgstAmt;

    // Create sales return header
    const salesReturn = await models.SalesReturn.create(
      {
        sales_return_no: header.sales_return_no,
        return_date: header.return_date || new Date(),
        return_time: header.return_time || null,
        employee_id: header.employee_id,
        customer_id: header.customer_id || null,
        branch_id: header.branch_id || null,
        subtotal_amount: subtotal,
        cgst_percent: header.cgst_percent || null,
        sgst_percent: header.sgst_percent || null,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        total_amount: total,
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
    for (const item of createdItems) {
      const originalInvoiceNo = items.find(
        orig => orig.product_item_detail_id === item.product_item_detail_id
      )?.invoice_no;

      if (originalInvoiceNo && item.product_item_detail_id) {
        // Find the original invoice by invoice_no
        const originalInvoice = await models.SalesInvoiceBill.findOne({
          where: { invoice_no: originalInvoiceNo },
          transaction: t,
        });

        if (originalInvoice) {
          await models.SalesInvoiceBillItem.update(
            { is_returned: true },
            {
              where: {
                invoice_bill_id: originalInvoice.id,
                product_item_detail_id: item.product_item_detail_id,
              },
              transaction: t,
            }
          );
        }
      }
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
      page = 1,
      limit = 10,
      status,
      customer_id,
      start_date,
      end_date,
      branch_id,
      sales_return_no
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = "WHERE 1 = 1";

    if (status) where += ` AND sr.status = '${status}'`;
    if (customer_id) where += ` AND sr.customer_id = ${customer_id}`;
    if (branch_id) where += ` AND sr.branch_id = ${branch_id}`;
    if (start_date) where += ` AND sr.return_date >= '${start_date}'`;
    if (end_date) where += ` AND sr.return_date <= '${end_date}'`;
    if (sales_return_no) where += ` AND sr.sales_return_no LIKE '%${sales_return_no}%'`;

    // Count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM sales_returns sr
      ${where};
    `;
    const countResult = await sequelize.query(countQuery, { type: sequelize.QueryTypes.SELECT });
    const total = countResult[0].total;

    // Data
    const dataQuery = `
      SELECT 
        sr.*, 
        c.customer_name AS customer_name,
        c.mobile_number AS customer_mobile,
        e.employee_name AS employee_name,
        b.branch_name
      FROM sales_returns sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      LEFT JOIN employees e ON sr.employee_id = e.id
      LEFT JOIN branches b ON sr.branch_id = b.id
      ${where}
      ORDER BY sr.return_date DESC, sr.id DESC
      LIMIT ${limit} OFFSET ${offset};
    `;
    const data = await sequelize.query(dataQuery, { type: sequelize.QueryTypes.SELECT });

    // --- Fetch items for all IDs ---
    const salesReturnIds = data.map(d => d.id);
    let itemsMap = {};

    if (salesReturnIds.length > 0) {
      const itemsQuery = `
        SELECT *
        FROM sales_return_items
        WHERE sales_return_id IN (${salesReturnIds.join(",")}) AND deleted_at IS NULL
        ORDER BY sales_return_id;
      `;

      const items = await sequelize.query(itemsQuery, { type: sequelize.QueryTypes.SELECT });

      items.forEach(it => {
        if (!itemsMap[it.sales_return_id]) {
          itemsMap[it.sales_return_id] = [];
        }
        itemsMap[it.sales_return_id].push(it);
      });
    }

    // Attach items to each sales return
    const finalData = data.map(d => {
      const items = itemsMap[d.id] || [];

      // SUM net_weight (convert to number and ignore nulls)
      const totalNetWeight = items.reduce((sum, it) => {
        const w = parseFloat(it.net_weight);
        return sum + (!isNaN(w) ? w : 0);
      }, 0);

      return {
        ...d,
        total_net_weight: totalNetWeight,
        items,        
      };
    });


    return commonService.okResponse(res, {
      total,
      page: parseInt(page),
      total_pages: Math.ceil(total / limit),
      data: finalData
    });

  } catch (err) {
    console.error(err);
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

    // 2. ITEMS VALIDATION
    if (!Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return commonService.badRequest(
        res,
        "At least one item is required"
      );
    }

    if (salesReturn.status != "On Hold") {
          await t.rollback();
          return commonService.badRequest(
            res,
            "Finalized sales return cannot be edited"
          );
        }

    // 3. RECALCULATE TOTALS
    let subtotal = 0;
    let totalQty = 0;

    const itemRows = items.map(it => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate || 0);
      const amount = Number(
        it.amount != null ? it.amount : qty * rate
      );

      subtotal += amount;
      totalQty += qty;

      return {
        id: it.id || null,
        product_id: it.product_id,
        product_item_detail_id: it.product_item_detail_id || null,
        sku_id: it.sku_id || null,
        hsn_code: it.hsn_code || null,
        product_description: it.product_description || null,
        net_weight: it.net_weight || null,
        gross_weight: it.gross_weight || null,
        quantity: qty,
        rate,
        amount
      };
    });

    const cgstAmt =
      header.cgst_amount !== undefined
        ? Number(header.cgst_amount)
        : Number(salesReturn.cgst_amount || 0);

    const sgstAmt =
      header.sgst_amount !== undefined
        ? Number(header.sgst_amount)
        : Number(salesReturn.sgst_amount || 0);

    const total = subtotal + cgstAmt + sgstAmt;

    // 4. UPDATE SALES RETURN HEADER
    await salesReturn.update(
      {
        sales_return_no:
        header.sales_return_no ?? salesReturn.sales_return_no,
        return_date: header.return_date || salesReturn.return_date,
        return_time: header.return_time || salesReturn.return_time,
        employee_id: header.employee_id,
        customer_id: header.customer_id,
        branch_id: header.branch_id,
        subtotal_amount: subtotal,
        cgst_percent: header.cgst_percent,
        sgst_percent: header.sgst_percent,
        cgst_amount: cgstAmt,
        sgst_amount: sgstAmt,
        total_amount: total,
        total_quantity: totalQty,
        status: header.status || salesReturn.status
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
            hsn_code: row.hsn_code,
            product_description: row.product_description,
            net_weight: row.net_weight,
            gross_weight: row.gross_weight,
            quantity: row.quantity,
            rate: row.rate,
            amount: row.amount
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

    await t.commit();
    return commonService.okResponse(res, {
      message: "Sales return updated successfully"
    });

  } catch (err) {
    await t.rollback();
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
  updateSalesReturn
};
