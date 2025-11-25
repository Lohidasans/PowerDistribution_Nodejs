const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const enMessage = require("../constants/en.json");
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

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
        amount
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
    const withFK = itemRows.map((row) => ({ ...row, sales_return_id: salesReturn.id }));
    const createdItems = await models.SalesReturnItem.bulkCreate(withFK, { 
      transaction: t, 
      returning: true 
    });

    await t.commit();
    return commonService.createdResponse(res, { 
      sales_return: salesReturn, 
      items: createdItems 
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
      branch_id
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE conditions manually
    let where = "WHERE 1 = 1";

    if (status) where += ` AND sr.status = '${status}'`;
    if (customer_id) where += ` AND sr.customer_id = ${customer_id}`;
    if (branch_id) where += ` AND sr.branch_id = ${branch_id}`;

    if (start_date) where += ` AND sr.return_date >= '${start_date}'`;
    if (end_date) where += ` AND sr.return_date <= '${end_date}'`;

    // 1️⃣ Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM sales_returns sr
      ${where};
    `;

    const countResult = await sequelize.query(countQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    const total = countResult[0].total;

    // 2️⃣ Fetch paginated data with joins (no associations)
    const dataQuery = `
      SELECT 
        sr.*, 
        c.customer_name AS customer_name,
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

    const data = await sequelize.query(dataQuery, {
      type: sequelize.QueryTypes.SELECT
    });

    return commonService.okResponse(res, {
      total,
      page: parseInt(page),
      total_pages: Math.ceil(total / limit),
      data
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
    const rows = await models.SalesReturn.findAll({
      attributes: ["id", "sales_return_no"],
      order: [["sales_return_no", "ASC"]],
    });
    return commonService.okResponse(res, { sales_return_no: rows });
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
  listSalesReturnDropdown
};
