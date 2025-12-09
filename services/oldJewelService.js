const { Op } = require('sequelize');
const commonService = require('./commonService');
const { models, sequelize } = require('../models/index');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create a new old jewel record with items
const createOldJewel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items = [], ...jewelData } = req.body;
    
    // Calculate totalAmount from items
    const totalAmount = items.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);
        
    // Create the main jewel record with calculated values
    const jewel = await models.OldJewel.create({
      ...jewelData,
      total_amount: totalAmount,
      date: jewelData.date || new Date().toISOString().split('T')[0],
      discount_type: jewelData.discount_type 
    }, { transaction });
    
    // Create jewel items if any
    if (items && items.length > 0) {
      const jewelItems = items.map(item => {
        const grsWeight = parseFloat(item.grs_weight) || 0;
        const wastage = parseFloat(item.wastage) || 0;
        const dustWeight = parseFloat(item.dust_weight) || 0;

        // ---- Correct net weight calculation ----
        const netWeight = grsWeight - wastage - dustWeight;

        return {
          ...item,
          old_jewel_id: jewel.id,
          grs_weight: grsWeight,
          wastage,
          dust_weight: dustWeight,
          net_weight: netWeight,
          rate: parseFloat(item.rate) || 0,
          amount: parseFloat(item.amount) || 0
        };
      });
      
      await models.OldJewelItem.bulkCreate(jewelItems, { transaction });
    }
    
    await transaction.commit();
    
    // Fetch the created record with its items
    const [jewelRecord, jewelItems] = await Promise.all([
      models.OldJewel.findByPk(jewel.id),
      models.OldJewelItem.findAll({ where: { old_jewel_id: jewel.id }})
    ]);
    
    const result = {
      ...jewelRecord.get({ plain: true }),
      items: jewelItems
    };
    
    return commonService.createdResponse(res, result);
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating old jewel:', error);
    return commonService.handleError(res, error);
  }
};

const getAllOldJewels = async (req, res) => {
  try {
    const { old_jewel_code } = req.query;

    // Build filter conditions
    const where = {};
    if (old_jewel_code) {
      where.old_jewel_code = old_jewel_code;
    }

    // Fetch all jewels (no pagination)
    const jewels = await models.OldJewel.findAll({
      where,
      order: [['id', 'DESC']],
      raw: true,
    });

    if (jewels.length === 0) {
      return commonService.okResponse(res, { data: [] });
    }

    // Collect employee and customer IDs
    const employeeIds = [...new Set(jewels.map(j => j.employee_id))];
    const customerIds = [...new Set(jewels.map(j => j.customer_id).filter(Boolean))];

    // Fetch employees
    const employees = await models.Employee.findAll({
      where: { id: employeeIds },
      attributes: ["id", "employee_no", "employee_name"],
      raw: true,
    });

    // Fetch customers
    const customers = await models.Customer.findAll({
      where: { id: customerIds },
      attributes: ["id", "customer_name", "mobile_number"],
      raw: true,
    });

    // Create lookup maps
    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.id] = emp;
      return acc;
    }, {});

    const customerMap = customers.reduce((acc, cust) => {
      acc[cust.id] = cust;
      return acc;
    }, {});

    // Fetch items for all jewels
    const jewelIds = jewels.map(j => j.id);
    const items = await models.OldJewelItem.findAll({
      where: { old_jewel_id: jewelIds },
      raw: true,
    });

    // Group items
    const itemsMap = items.reduce((acc, item) => {
      if (!acc[item.old_jewel_id]) acc[item.old_jewel_id] = [];
      acc[item.old_jewel_id].push(item);
      return acc;
    }, {});

    // Merge all data
    const result = jewels.map(jewel => {
      const jewelItems = itemsMap[jewel.id] || [];

      const totalNetWeight = jewelItems.reduce((sum, item) => {
        return sum + (parseFloat(item.net_weight) || 0);
      }, 0);

      return {
        ...jewel,
        employee_no: employeeMap[jewel.employee_id]?.employee_no || null,
        employee_name: employeeMap[jewel.employee_id]?.employee_name || null,
        customer_name: customerMap[jewel.customer_id]?.customer_name || null,
        customer_mobile: customerMap[jewel.customer_id]?.mobile_number || null,
        total_net_weight: totalNetWeight.toFixed(3), // format same as DB
        items: jewelItems,       
      };
    });


    return commonService.okResponse(res, { data: result });

  } catch (error) {
    console.error("Error fetching Old Jewels:", error);
    return commonService.handleError(res, error);
  }
};


// Get a single old jewel record by ID
const getOldJewelById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [jewel, items] = await Promise.all([
      models.OldJewel.findByPk(id, { raw: true }),
      models.OldJewelItem.findAll({ 
        where: { old_jewel_id: id },
        raw: true
      })
    ]);
    
    if (!jewel) {
      return commonService.notFound(res, 'Old jewel record not found');
    }
    
    const result = {
      ...jewel,
      items: items || []
    };
    
    return commonService.okResponse(res, result);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update Old Jewel and its items (update by item.id only; do not destroy or insert)
const updateOldJewel = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { items = [], ...updateData } = req.body;

    // --- Find existing Old Jewel record ---
    const jewel = await models.OldJewel.findByPk(id, { transaction });
    if (!jewel) {
      await transaction.rollback();
      return commonService.notFound(res, "Old jewel record not found");
    }

    // --- Recalculate total_amount from items (NEW UI logic) ---
    if (items.length > 0) {
      const totalAmount = items.reduce((sum, item) => {
        return sum + (parseFloat(item.amount) || 0);
      }, 0);

      updateData.total_amount = totalAmount;
    }

    // --- Update Old Jewel (header fields) ---
    await jewel.update(updateData, { transaction });

    // --- Update each item (only if ID exists) ---
    for (const item of items) {
      if (item && item.id) {
        const existingItem = await models.OldJewelItem.findOne({
          where: { id: item.id, old_jewel_id: id },
          transaction,
        });

        if (existingItem) {
          const {
            id: _omit,
            old_jewel_id: _omit2,
            created_at,
            updated_at,
            deleted_at,
            ...updatableFields
          } = item;

          await existingItem.update(
            {
              ...updatableFields,
              grs_weight: parseFloat(item.grs_weight) || 0,
              dust_weight: parseFloat(item.dust_weight) || 0,
              net_weight: parseFloat(item.net_weight) || 0,
              wastage: parseFloat(item.wastage) || 0,
              rate: parseFloat(item.rate) || 0,
              amount: parseFloat(item.amount) || 0
            },
            { transaction }
          );
        }
      }
    }

    await transaction.commit();

    // --- Fetch updated record and items ---
    const [updatedJewel, updatedItems] = await Promise.all([
      models.OldJewel.findByPk(id, { raw: true }),
      models.OldJewelItem.findAll({
        where: { old_jewel_id: id },
        raw: true,
      }),
    ]);

    return commonService.okResponse(res, {
      ...updatedJewel,
      items: updatedItems,
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Error updating Old Jewel:", error);
    return commonService.handleError(res, error);
  }
};

// Delete an old jewel record (soft delete)
const deleteOldJewel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    
    const jewel = await models.OldJewel.findByPk(id, { transaction });
    
    if (!jewel) {
      await transaction.rollback();
      return commonService.notFound(res, 'Old jewel record not found');
    }
    
    // Soft delete the jewel record (paranoid: true will handle this)
    await jewel.destroy({ transaction });
    
    // Also soft delete associated items
    await models.OldJewelItem.destroy({
      where: { old_jewel_id: id },
      transaction
    });
    
    await transaction.commit();
    
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

const generateOldJewelCode = async (req, res) => {
  try {
    const { prefix } = req.query || {};

    const code = await generateFiscalSeriesCode(
      models.OldJewel,
      "old_jewel_code",
      String(prefix).toUpperCase(),
      { pad: 3 }
    );
    return commonService.okResponse(res, { old_jewel_code: code });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const listOldJewelDropdown = async (req, res) => {
  try {
    const { customer_id } = req.query;
    const where = {};

    if (customer_id) {
      where.customer_id = customer_id; // apply filter only if passed
    }

    const rows = await models.OldJewel.findAll({
      attributes: ["id", "old_jewel_code", "customer_id"],
      where, // <-- applied here
      order: [["old_jewel_code", "ASC"]],
    });

    return commonService.okResponse(res, { old_jewel_code: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createOldJewel,
  getAllOldJewels,
  getOldJewelById,
  updateOldJewel,
  deleteOldJewel,
  generateOldJewelCode,
  listOldJewelDropdown
};
