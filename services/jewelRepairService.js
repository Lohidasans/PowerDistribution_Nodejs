const { Op } = require('sequelize');
const commonService = require('./commonService');
const { models, sequelize } = require('../models/index');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");
const { validateDuplicateUniqueCode } = require('../helpers/billingValidations');

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
    const employeeData = await validateDuplicateUniqueCode({
      model: models.JewelRepair,
      billField: "repair_code",
      billValue: repairData.repair_code,
      employee_id: repairData.employee_id,
      transaction,
      bill_name: "Jewel Repair",
    });

    // Create Jewel Repair
    const repair = await models.JewelRepair.create(
      {
        repair_code: repairData.repair_code,
        customer_id: repairData.customer_id,
        employee_id: repairData.employee_id,
        branch_id: repairData.branch_id,
        date: repairData.date || new Date().toISOString().split("T")[0],
        time: repairData.time || null,
        status: "Completed",

        sub_total_amount: subTotal,
        discount_type: repairData.discount_type || null,
        discount: repairData.discount || 0,   // STORE PAYLOAD VALUE
        total_amount: totalAmount,
        total_quantity: totalQuantity,
        amount_in_words: repairData.amount_in_words || null,
        amount_due: repairData.amount_due || 0,
        refund_amount: repairData.refund_amount || 0,
      },
      { transaction }
    );
  
    // Create Repair Items
    const repairItemsPayload = items.map(item => ({
      repair_id: repair.id,
      material_type_id: item.material_type_id,
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
    const {
      page,
      pageSize,
      search,
      status,
      customer_id,
      branch_id,
      repair_code,
      from_date,
      to_date
    } = req.query;

    const replacements = {};
    let whereSql = `jr.deleted_at IS NULL`;
    // Filters
    if (status) { whereSql += ` AND jr.status = :status`; replacements.status = status;}
    if (customer_id) { whereSql += ` AND jr.customer_id = :customer_id`; replacements.customer_id = customer_id;}
    if (branch_id) { whereSql += ` AND jr.branch_id = :branch_id`; replacements.branch_id = branch_id; }
    if (repair_code) { whereSql += ` AND jr.repair_code = :repair_code`; replacements.repair_code = repair_code;}
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

    
    // Pagination (optional)
    
    let paginationSql = '';
    let limit, offset;

    if (pageSize) {
      limit = Number(pageSize);
      offset = page ? (Number(page) - 1) * limit : 0;

      paginationSql = ` LIMIT :limit OFFSET :offset`;
      replacements.limit = limit;
      replacements.offset = offset;
    }

    
    // Main query
    
    const repairs = await sequelize.query(
      `SELECT
        jr.*,
        e.employee_name AS employee_name,
        e.employee_no AS employee_code,

        -- Customer details
        c.customer_name AS customer_name,
        c.address AS customer_address,
        c.mobile_number AS customer_mobile_number,
        c.pin_code AS customer_pincode,
        c.pan_no AS customer_pan_no,
        c.gst_no AS customer_gst_no,

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
      LEFT JOIN customers c ON c.id = jr.customer_id
      LEFT JOIN employees e ON e.id = jr.employee_id
      LEFT JOIN countries cc ON cc.id = c.country_id
      LEFT JOIN states cs ON cs.id = c.state_id
      LEFT JOIN districts cd ON cd.id = c.district_id
      LEFT JOIN branches b ON b.id = jr.branch_id
      LEFT JOIN states bs ON bs.id = b.state_id
      LEFT JOIN districts bd ON bd.id = b.district_id

      WHERE ${whereSql}
      ORDER BY jr.id DESC
      ${paginationSql}`,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT,
      }
    );
    // Count query
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
      const response = { data: [] };
      if (pageSize) {
        response.pagination = {
          total,
          page: Number(page || 1),
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
        };
      }

      return commonService.okResponse(res, response);
    }

    
    // Fetch items & payments
    
    const repairIds = repairs.map(r => r.id);

    const [items, payments] = await Promise.all([
      sequelize.query(
        `SELECT
          jri.*, mt.material_type,
          p.product_name
        FROM jewel_repair_items jri
        LEFT JOIN products p ON p.id = jri.product_id
        LEFT JOIN "materialTypes" mt ON mt.id = jri.material_type_id AND mt.deleted_at IS NULL
        WHERE jri.repair_id IN (:repairIds)`,
        {
          replacements: { repairIds },
          type: sequelize.QueryTypes.SELECT
        }
      ),
      sequelize.query(
        `SELECT *
         FROM payments
         WHERE jewel_repair_id IN (:repairIds)
         AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        {
          replacements: { repairIds },
          type: sequelize.QueryTypes.SELECT
        }
      )
    ]);

    
    // Group by repair_id
    
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

    
    // Final response
    
    const result = repairs.map(repair => {
      const totalPaid = Number(repair.total_paid_amount || 0);  
      const amountDue = Number(repair.amount_due || 0); 
      const refundAmount = Number(repair.refund_amount || 0);
      return {
        ...repair,
        total_paid_amount: totalPaid.toFixed(2),
        refundAmount: refundAmount.toFixed(2),
        amount_due: amountDue.toFixed(2),
        items: itemsMap[repair.id] || [],
        payments: paymentsMap[repair.id] || []
      };
    });

    const response = { data: result };

    if (pageSize) {
      response.pagination = {
        total,
        page: Number(page || 1),
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    return commonService.okResponse(res, response);
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
    const { repair_id } = req.params;
    const { items = [], payment = [], ...repairData } = req.body;

    if (!items.length) {
      return commonService.badRequest(res, "At least one item is required");
    }

    const repair = await models.JewelRepair.findByPk(repair_id, { transaction });

    if (!repair) {
      return commonService.badRequest(res, "Jewel Repair not found");
    }

    /* -------------------------
       CALCULATE TOTALS
    ------------------------- */

    const subTotal = items.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

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

    if (discountCalculated > subTotal) discountCalculated = subTotal;

    const totalAmount = subTotal - discountCalculated;

    /* -------------------------
       UPDATE HEADER
    ------------------------- */

    await repair.update(
      {
        repair_code: repairData.repair_code ?? repair.repair_code,
        customer_id: repairData.customer_id ?? repair.customer_id,
        employee_id: repairData.employee_id ?? repair.employee_id,
        branch_id: repairData.branch_id ?? repair.branch_id,
        date: repairData.date ?? repair.date,
        time: repairData.time ?? repair.time,

        sub_total_amount: subTotal,
        discount_type: repairData.discount_type ?? repair.discount_type,
        discount: repairData.discount ?? repair.discount,
        total_amount: totalAmount,
        total_quantity: totalQuantity,
        amount_in_words: repairData.amount_in_words ?? repair.amount_in_words,
        amount_due: repairData.amount_due ?? repair.amount_due,
        refund_amount: repairData.refund_amount ?? repair.refund_amount,
      },
      { transaction }
    );

    /* -------------------------
       HANDLE ITEMS (UPSERT)
    ------------------------- */

    const existingItems = await models.JewelRepairItem.findAll({
      where: { repair_id },
      transaction,
      raw: true,
    });

    const existingItemIds = existingItems.map((i) => i.id);
    const incomingItemIds = items.filter((i) => i.id).map((i) => i.id);

    // DELETE removed items
    const itemsToDelete = existingItemIds.filter(
      (id) => !incomingItemIds.includes(id)
    );

    if (itemsToDelete.length) {
      await models.JewelRepairItem.destroy({
        where: { id: itemsToDelete },
        transaction,
      });
    }

    // UPSERT items
    for (const item of items) {
      const payload = {
        repair_id,
        material_type_id: item.material_type_id,
        description: item.description,
        quantity: Number(item.quantity || 1),
        weight: Number(item.weight || 0),
        amount: Number(item.amount || 0),
        remarks: item.remarks || null,
      };

      if (item.id) {
        await models.JewelRepairItem.update(payload, {
          where: { id: item.id },
          transaction,
        });
      } else {
        await models.JewelRepairItem.create(payload, { transaction });
      }
    }

    /* -------------------------
       HANDLE PAYMENTS (UPSERT)
    ------------------------- */

    const existingPayments = await models.Payment.findAll({
      where: { jewel_repair_id: repair_id },
      transaction,
      raw: true,
    });

    const existingPaymentIds = existingPayments.map((p) => p.id);
    const incomingPaymentIds = payment.filter((p) => p.id).map((p) => p.id);

    const paymentsToDelete = existingPaymentIds.filter(
      (id) => !incomingPaymentIds.includes(id)
    );

    if (paymentsToDelete.length) {
      await models.Payment.destroy({
        where: { id: paymentsToDelete },
        transaction,
      });
    }

    for (const p of payment) {
      const payload = {
        jewel_repair_id: repair_id,
        payment_mode: p.payment_mode,
        amount_received: Number(p.amount_received || 0),
        transaction_id: p.transaction_id || null,
        payment_date: new Date(),
        status: "Completed",
      };

      if (p.id) {
        await models.Payment.update(payload, {
          where: { id: p.id },
          transaction,
        });
      } else {
        await models.Payment.create(payload, { transaction });
      }
    }

    /* -------------------------
       FETCH UPDATED DATA
    ------------------------- */

    const [repairRecord, repairItems, payments] = await Promise.all([
      models.JewelRepair.findByPk(repair_id, { transaction }),
      models.JewelRepairItem.findAll({
        where: { repair_id },
        transaction,
      }),
      models.Payment.findAll({
        where: { jewel_repair_id: repair_id },
        transaction,
      }),
    ]);

    await transaction.commit();

    return commonService.okResponse(res, {
      ...repairRecord.get({ plain: true }),
      items: repairItems,
      payments,
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Update Jewel Repair Error:", error);
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

// Toggle active status for jewel repair
const toggleJewelRepairActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return commonService.badRequest(res, "is_active must be a boolean value");
    }

    const jewelRepair = await models.JewelRepair.findByPk(id);
    if (!jewelRepair) {
      return commonService.notFound(res, "Jewel repair not found");
    }

    await jewelRepair.update({ is_active });

    return commonService.okResponse(res, {
      message: "Jewel repair active status updated successfully",
      is_active
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const payJewelRepairDue = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { repair_id } = req.params;
    const {
      payment_mode,
      amount_received,
      transaction_id
    } = req.body;

    const repair = await models.JewelRepair.findOne({
      where: {
        id: repair_id,
        is_active: true
      },
      transaction
    });

    if (!repair) {
      await transaction.rollback();
      return commonService.notFoundResponse(
        res,
        "Jewel Repair not found"
      );
    }

    // Total paid till now
    const totalPaid = await models.Payment.sum(
      "amount_received",
      {
        where: {
          jewel_repair_id: repair_id,
          status: "Completed"
        },
        transaction
      }
    );

    const currentPaid = Number(totalPaid || 0);
    const dueAmount =
      Number(repair.total_amount) - currentPaid;

    if (Number(amount_received) <= 0) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        "Amount must be greater than 0"
      );
    }

    if (Number(amount_received) > dueAmount) {
      await transaction.rollback();
      return commonService.badRequest(
        res,
        `Amount exceeds due amount ₹${dueAmount}`
      );
    }

    // Create new payment record
    const payment = await models.Payment.create(
      {
        jewel_repair_id: repair.id,
        payment_mode,
        amount_received,
        transaction_id,
        payment_date: new Date(),
        status: "Completed"
      },
      { transaction }
    );

    // Recalculate paid and due
    const updatedPaid =
      currentPaid + Number(amount_received);

    const updatedDue =
      Number(repair.total_amount) - updatedPaid;

    await repair.update(
      {
        amount_due: updatedDue
      },
      { transaction }
    );

    await transaction.commit();

    return commonService.okResponse(res, {
      repair_id: repair.id,
      repair_code: repair.repair_code,
      total_amount: Number(repair.total_amount),
      paid_amount: updatedPaid,
      amount_due: updatedDue,
      payment
    });

  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createJewelRepair,
  getAllJewelRepairs,
  getJewelRepairById,
  updateJewelRepair,
  deleteJewelRepair,
  generateRepairCode,
  toggleJewelRepairActive,
  payJewelRepairDue
};
