const { Op } = require('sequelize');
const commonService = require('./commonService');
const { models, sequelize } = require('../models/index');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create a new jewel repair record with items
const createJewelRepair = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { items = [], payment = [], ...repairData } = req.body;

    if (!items.length) {
      return commonService.badRequest(res, "At least one item is required");
    }

    const subTotal = items.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );
``
    const totalQuantity = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    let discountCalculated = 0;

    if (repairData.discount_type === "Percentage" && repairData.discount) {
      discountCalculated = (subTotal * Number(repairData.discount)) / 100;
    }

    if (repairData.discount_type === "Amount" && repairData.discount) {
      discountCalculated = Number(repairData.discount);
    }

    if (discountCalculated > subTotal) {
      discountCalculated = subTotal;
    }

    const totalAmount = subTotal - discountCalculated;

    // Prevent duplicate repair code
    if (repairData.repair_code) {
      const exists = await models.JewelRepair.findOne({
        where: {
          repair_code: repairData.repair_code,
          deleted_at: null,
        },
      });

      if (exists) {
        return commonService.badRequest(
          res,
          "Jewel Repair code already exists"
        );
      }
    }

    // Create Jewel Repair
    const repair = await models.JewelRepair.create(
      {
        repair_code: repairData.repair_code,
        customer_id: repairData.customer_id,
        employee_id: repairData.employee_id,
        branch_id: repairData.branch_id,
        date: repairData.date || new Date().toISOString().split("T")[0],
        time: repairData.time || null,
        status: "Pending",

        sub_total_amount: subTotal,
        discount_type: repairData.discount_type || null,
        discount: repairData.discount || 0,   // STORE PAYLOAD VALUE
        total_amount: totalAmount,
        total_quantity: totalQuantity,
        amount_in_words: repairData.amount_in_words || null,
        amount_due: repairData.amount_due || 0,
      },
      { transaction }
    );
  
    // Create Repair Items
    const repairItemsPayload = items.map(item => ({
      repair_id: repair.id,
      description: item.description,
      quantity: Number(item.quantity || 1),
      weight: Number(item.weight || 0),
      amount: Number(item.amount || 0),
      remarks: item.remarks || null,
    }));

    await models.JewelRepairItem.bulkCreate(repairItemsPayload, {
      transaction,
    });

    // Payments
    if (Array.isArray(payment) && payment.length) {
      const paymentPayload = payment.map(p => ({
        jewel_repair_id: repair.id,
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received || 0),
        transaction_id: p.transaction_id || null,
        payment_date: new Date(),
        status: "Completed",
      }));

      await models.Payment.bulkCreate(paymentPayload, { transaction });
    }

    // Fetch full response
    const [repairRecord, repairItems, payments] = await Promise.all([
      models.JewelRepair.findByPk(repair.id, { transaction }),
      models.JewelRepairItem.findAll({
        where: { repair_id: repair.id },
        transaction,
      }),
      models.Payment.findAll({
        where: { jewel_repair_id: repair.id },
        transaction,
      }),
    ]);

    const [customer, employee, branch] = await Promise.all([
      repairRecord.customer_id
        ? models.Customer.findByPk(repairRecord.customer_id, {
          attributes: ["id", "customer_name", "mobile_number"],
        })
        : null,
      repairRecord.employee_id
        ? models.Employee.findByPk(repairRecord.employee_id, {
          attributes: ["id", "employee_name"],
        })
        : null,
      repairRecord.branch_id
        ? models.Branch.findByPk(repairRecord.branch_id, {
          attributes: ["id", "branch_name"],
        })
        : null,
    ]);

    await transaction.commit();

    return commonService.createdResponse(res, {
      ...repairRecord.get({ plain: true }),
      customer,
      employee,
      branch,
      items: repairItems,
      payments,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Create Jewel Repair Error:", error);
    return commonService.handleError(res, error);
  }
};

// Get all jewel repairs with pagination
const getAllJewelRepairs = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search, status, customer_id, branch_id, repair_code, from_date, to_date } = req.query;

    const limit = Number(pageSize);
    const offset = (page - 1) * limit;

    const replacements = { limit, offset };
    let whereSql = `jr.deleted_at IS NULL`;

    // Filters
    if (status) { whereSql += ` AND jr.status = :status`; replacements.status = status; }
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
        e.employee_name AS employee_name,

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
        bs.state_name AS branch_state_name,

        -- Payment summary
        (
          SELECT COALESCE(SUM(p.amount_received), 0)
          FROM payments p
          WHERE p.jewel_repair_id = jr.id
          AND p.deleted_at IS NULL
        ) AS total_paid_amount

      FROM jewel_repairs jr

      -- Customer joins
      LEFT JOIN customers c ON c.id = jr.customer_id
      LEFT JOIN employees e ON e.id = jr.employee_id
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

    // 3️. Fetch repair items and payments
    const repairIds = repairs.map(r => r.id);

    const [items, payments] = await Promise.all([
      // Fetch repair items
      sequelize.query(
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
      ),
      // Fetch payments
      sequelize.query(
        `SELECT
          p.*
        FROM payments p
        WHERE p.jewel_repair_id IN (:repairIds)
        AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC`,
        {
          replacements: { repairIds },
          type: sequelize.QueryTypes.SELECT
        }
      )
    ]);

    // 4️. Group items and payments by repair_id
    const itemsMap = items.reduce((acc, item) => {
      if (!acc[item.repair_id]) acc[item.repair_id] = [];
      acc[item.repair_id].push(item);
      return acc;
    }, {});

    const paymentsMap = payments.reduce((acc, payment) => {
      if (!acc[payment.jewel_repair_id]) acc[payment.jewel_repair_id] = [];
      acc[payment.jewel_repair_id].push(payment);
      return acc;
    }, {});

    // 5️. Final response
    const result = repairs.map(repair => {
      const totalPaid = parseFloat(repair.total_paid_amount || 0);
      const totalAmount = parseFloat(repair.total_amount || 0);
      const amountDue = totalAmount - totalPaid;

      return {
        ...repair,
        total_paid_amount: totalPaid.toFixed(2),
        amount_due: amountDue.toFixed(2),
        items: itemsMap[repair.id] || [],
        payments: paymentsMap[repair.id] || []
      };
    });

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
