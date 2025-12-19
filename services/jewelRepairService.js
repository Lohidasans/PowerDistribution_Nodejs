const { Op } = require('sequelize');
const commonService = require('./commonService');
const { models, sequelize } = require('../models/index');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create a new jewel repair record with items
const createJewelRepair = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items = [], payment = {}, ...repairData } = req.body;
    
    // Calculate subtotal and total quantity from items
    const subTotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);
    
    const totalQuantity = items.reduce((sum, item) => {
      return sum + (parseInt(item.quantity) || 0);
    }, 0);
    
    let discountAmt = 0;

    if (repairData.discount_type === "Percentage" && repairData.discount_amount) {
      // For percentage, calculate the discount amount
      discountAmt = (subTotal * parseFloat(repairData.discount_amount)) / 100;
    } else if (repairData.discount_amount) {
      // For fixed amount, use the amount directly
      discountAmt = parseFloat(repairData.discount_amount);
    }
    const totalAmount = subTotal - discountAmt;

    // Check if a non-deleted record already uses this code
    if (repairData.repair_code) {
      const existing = await models.JewelRepair.findOne({
        where: {
          repair_code: repairData.repair_code,
          deleted_at: null,     // only check active (non-deleted) records
        },
      });

      if (existing) {
        return commonService.badRequest(res, {
          message: "Jewel Repair code already exists",
        });
      }
    }    
    
    // Create the main repair record with calculated values
    const repair = await models.JewelRepair.create({
      ...repairData,
      sub_total_amount: subTotal,
      total_amount: totalAmount,
      total_quantity: totalQuantity,
      date: repairData.date || new Date().toISOString().split('T')[0],
      status: 'Pending' // Default status
    }, { transaction });
    
    // Create repair items if any
    if (items && items.length > 0) {
      const repairItems = items.map(item => ({
        ...item,
        repair_id: repair.id,
        weight: parseFloat(item.weight) || 0,
        quantity: parseFloat(item.quantity) || 1,
        amount: parseFloat(item.amount) || 0
      }));
      
      await models.JewelRepairItem.bulkCreate(repairItems, { transaction });
    }
 
    // Handle payments - only array of payments is accepted
    if (payment && Array.isArray(payment)) {
      const paymentRows = payment
        .filter(p => p.payment_mode) // ignore any empty objects
        .map(p => ({
          jewel_repair_id: repair.id,
          payment_mode: p.payment_mode,
          amount_received: p.amount_received || 0,
          payment_date: p.payment_date || new Date(),
          transaction_id: p.transaction_id || null,
          status: 'Completed',
          created_by: req.user?.id || null,
        }));

      if (paymentRows.length > 0) {
        await models.Payment.bulkCreate(paymentRows, { transaction });
      }
    }

    // Update the final query to fetch all payments
    const [repairRecord, repairItems, payments] = await Promise.all([
      models.JewelRepair.findByPk(repair.id, { transaction }),
      models.JewelRepairItem.findAll({
        where: { repair_id: repair.id },
        transaction
      }),
      models.Payment.findAll({
        where: { jewel_repair_id: repair.id },
        transaction
      })
    ]);

    
    // Get customer, employee, and branch data separately
    const [customer, employee, branch] = await Promise.all([
      repairRecord.customer_id ? models.Customer.findByPk(repairRecord.customer_id, {
        attributes: ['id', 'customer_name', 'mobile_number']
      }) : null,
      repairRecord.employee_id ? models.Employee.findByPk(repairRecord.employee_id, {
        attributes: ['id', 'employee_name']
      }) : null,
      repairRecord.branch_id ? models.Branch.findByPk(repairRecord.branch_id, {
        attributes: ['id', 'branch_name']
      }) : null
    ]);
    
    // Get product data for items
    const itemProductIds = repairItems.map(item => item.product_id).filter(Boolean);
    const products = itemProductIds.length > 0 ? await models.Product.findAll({
      where: { id: itemProductIds },
      attributes: ['id', 'product_name', 'product_code'],
      raw: true
    }) : [];
    
    const productsMap = products.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});
    
    // Format items with product data
    const formattedItems = repairItems.map(item => ({
      ...item.get({ plain: true }),
      product: item.product_id ? productsMap[item.product_id] : null
    }));
    
    const result = {
      ...repairRecord.get({ plain: true }),
      customer,
      employee,
      branch,
      items: formattedItems,
      payments: payments || []
    };
    
    await transaction.commit();  
    
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating jewel repair:', error);
    return commonService.handleError(res, error);
  }
};

// Get all jewel repairs with pagination
const getAllJewelRepairs = async (req, res) => {
  try {
    const {page = 1, pageSize = 10, search, status, customer_id, branch_id, repair_code, from_date, to_date } = req.query;

    const limit = Number(pageSize);
    const offset = (page - 1) * limit;

    const replacements = { limit, offset };
    let whereSql = `jr.deleted_at IS NULL`;

    // Filters
    if (status) {  whereSql += ` AND jr.status = :status`;  replacements.status = status; }
    if (customer_id) { whereSql += ` AND jr.customer_id = :customer_id`; replacements.customer_id = customer_id; }
    if (branch_id) { whereSql += ` AND jr.branch_id = :branch_id`; replacements.branch_id = branch_id; }
    if (repair_code) { whereSql += ` AND jr.repair_code = :repair_code`; replacements.repair_code = repair_code; }

    if (from_date && to_date) {
      whereSql += ` AND jr.date BETWEEN :from_date AND :to_date`;
      replacements.from_date = from_date;
      replacements.to_date = to_date;
    }

    if (search) {
      whereSql += `
        AND (
          jr.repair_code ILIKE :search
          OR c.customer_name ILIKE :search
          OR c.mobile_number ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }

    // 1️. Main repairs query with JOINs
    const repairs = await sequelize.query(
      `SELECT
        jr.*,

        -- Customer details
        c.customer_name AS customer_name,
        c.address AS customer_address,
        c.mobile_number AS customer_mobile_number,
        c.pin_code AS customer_pincode,
        c.pan_no AS customer_pan_no,
        -- Customer location
        cc.country_name AS customer_country_name,
        cd.district_name AS customer_district_name,
        cs.state_name AS customer_state_name,

        -- Branch details
        b.branch_name AS branch_name,
        b.address AS branch_address,
        b.mobile AS branch_mobile_number,
        b.pin_code AS branch_pincode,
        b.gst_no AS branch_gst_no,

        -- Branch location
        bd.district_name AS branch_district_name,
        bs.state_name AS branch_state_name
      FROM jewel_repairs jr

      -- Customer joins
      LEFT JOIN customers c ON c.id = jr.customer_id
      LEFT JOIN countries cc ON cc.id = c.country_id
      LEFT JOIN states cs ON cs.id = c.state_id
      LEFT JOIN districts cd ON cd.id = c.district_id

      -- Branch joins
      LEFT JOIN branches b ON b.id = jr.branch_id
      LEFT JOIN states bs ON bs.id = b.state_id
      LEFT JOIN districts bd ON bd.id = b.district_id

      WHERE ${whereSql}
      ORDER BY jr.id DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      });

    // 2️. Count query
    const [{ total }] = await sequelize.query(
      `SELECT COUNT(*)::int AS total
      FROM jewel_repairs jr
      LEFT JOIN customers c ON c.id = jr.customer_id
      WHERE ${whereSql}`,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (repairs.length === 0) {
      return commonService.okResponse(res, {
        data: [],
        pagination: {
          total,
          page: Number(page),
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // 3️. Fetch repair items
    const repairIds = repairs.map(r => r.id);

    const items = await sequelize.query(
      `SELECT
        jri.*,
        p.product_name
      FROM jewel_repair_items jri
      LEFT JOIN products p ON p.id = jri.product_id
      WHERE jri.repair_id IN (:repairIds)`,
      {
        replacements: { repairIds },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // 4️. Group items by repair_id
    const itemsMap = items.reduce((acc, item) => {
      if (!acc[item.repair_id]) acc[item.repair_id] = [];
      acc[item.repair_id].push(item);
      return acc;
    }, {});

    // 5️. Final response
    const result = repairs.map(repair => ({
      ...repair,
      items: itemsMap[repair.id] || []
    }));

    return commonService.okResponse(res, {
      data: result,
      pagination: {
        total,
        page: Number(page),
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching jewel repairs:", error);
    return commonService.handleError(res, error);
  }
};


// Get a single jewel repair record by ID
const getJewelRepairById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [repair, items] = await Promise.all([
      models.JewelRepair.findByPk(id),
      models.JewelRepairItem.findAll({ 
        where: { repair_id: id },
        raw: true
      })
    ]);
    
    if (!repair) {
      return commonService.notFound(res, 'Jewel repair record not found');
    }
    
    // Get related data
    const [customer, employee, branch, deliveredBy] = await Promise.all([
      repair.customer_id ? models.Customer.findByPk(repair.customer_id, {
        attributes: ['id', 'customer_name', 'mobile_number'],
        raw: true
      }) : null,
      repair.employee_id ? models.Employee.findByPk(repair.employee_id, {
        attributes: ['id', 'employee_name'],
        raw: true
      }) : null,
      repair.branch_id ? models.Branch.findByPk(repair.branch_id, {
        attributes: ['id', 'branch_name'],
        raw: true
      }) : null,
      repair.delivered_by ? models.Employee.findByPk(repair.delivered_by, {
        attributes: ['id', 'employee_name'],
        raw: true
      }) : null
    ]);
    
    // Get product data for items
    const productIds = [...new Set(items.map(item => item.product_id).filter(Boolean))];
    const products = productIds.length > 0 ? await models.Product.findAll({
      where: { id: productIds },
      attributes: ['id', 'product_name', 'product_code'],
      raw: true
    }) : [];
    
    const productsMap = products.reduce((acc, product) => {
      acc[product.id] = product;
      return acc;
    }, {});
    
    // Format items with product data
    const formattedItems = items.map(item => ({
      ...item,
      product: item.product_id ? productsMap[item.product_id] : null
    }));
    
    const result = {
      ...repair.get({ plain: true }),
      customer,
      employee,
      branch,
      deliveredBy,
      items: formattedItems
    };
    
    return commonService.okResponse(res, result);
  } catch (error) {
    console.error('Error fetching jewel repair:', error);
    return commonService.handleError(res, error);
  }
};

// Update Jewel Repair and its items
const updateJewelRepair = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], ...updateData } = req.body;

    // Find existing repair record
    const repair = await models.JewelRepair.findByPk(id, { transaction });
    if (!repair) {
      await transaction.rollback();
      return commonService.notFound(res, "Jewel repair record not found");
    }

    // Recalculate totals if item data is passed
    if (items.length > 0) {
      const subTotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      const totalQuantity = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
      const discount = parseFloat(updateData.discount) || 0;
      const totalAmount = subTotal - discount;

      updateData.sub_total_amount = subTotal;
      updateData.total_amount = totalAmount;
      updateData.total_quantity = totalQuantity;
    }

    // Update repair header fields
    await repair.update(updateData, { transaction });

    // Update each existing item (only if ID is provided)
    for (const item of items) {
      if (item && item.id) {
        const existingItem = await models.JewelRepairItem.findOne({
          where: { id: item.id, repair_id: id },
          transaction,
        });

        if (existingItem) {
          const { id: _omit, repair_id: _omit2, created_at, updated_at, deleted_at, ...updatableFields } = item;
          await existingItem.update(updatableFields, { transaction });
        }
      }
    }

    await transaction.commit();

    // Fetch updated record with items
    const [updatedRepair, updatedItems] = await Promise.all([
      models.JewelRepair.findByPk(id, {
        include: [
          { model: models.Customer, as: 'customer', attributes: ['id', 'customer_name', 'mobile_number'] },
          { model: models.Employee, as: 'employee', attributes: ['id', 'employee_name'] },
          { model: models.Branch, as: 'branch', attributes: ['id', 'branch_name'] }
        ]
      }),
      models.JewelRepairItem.findAll({
        where: { repair_id: id },
        include: [
          { model: models.Product, as: 'product', attributes: ['id', 'product_name', 'product_code'] }
        ]
      }),
    ]);

    return commonService.okResponse(res, {
      ...updatedRepair.get({ plain: true }),
      items: updatedItems,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating Jewel Repair:", error);
    return commonService.handleError(res, error);
  }
};

// Delete a jewel repair record (soft delete)
const deleteJewelRepair = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    
    const repair = await models.JewelRepair.findByPk(id, { transaction });
    
    if (!repair) {
      await transaction.rollback();
      return commonService.notFound(res, 'Jewel repair record not found');
    }
    
    // Soft delete the repair record (paranoid: true will handle this)
    await repair.destroy({ transaction });
    
    // Also soft delete associated items
    await models.JewelRepairItem.destroy({
      where: { repair_id: id },
      transaction
    });
    
    await transaction.commit();
    
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting jewel repair:', error);
    return commonService.handleError(res, error);
  }
};

// Generate repair code
const generateRepairCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.JewelRepair,
      "repair_code",
      String(prefix || 'REP').toUpperCase(),
      { pad: 4 }
    );
    return commonService.okResponse(res, { repair_code: code });
  } catch (err) {
    console.error('Error generating repair code:', err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createJewelRepair,
  getAllJewelRepairs,
  getJewelRepairById,
  updateJewelRepair,
  deleteJewelRepair,
  generateRepairCode,
};
