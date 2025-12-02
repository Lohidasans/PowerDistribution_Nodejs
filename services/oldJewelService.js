const { Op } = require('sequelize');
const commonService = require('./commonService');
const { models, sequelize } = require('../models/index');
const { generateFiscalSeriesCode } = require("../helpers/codeGeneration");

// Create a new old jewel record with items
const createOldJewel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { items = [], ...jewelData } = req.body;
    
    // Calculate subtotal from items
    const subTotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.amount) || 0);
    }, 0);
    
    // Calculate GST amounts if applicable
    const cgstPercent = parseFloat(jewelData.cgst_percent) || 0;
    const sgstPercent = parseFloat(jewelData.sgst_percent) || 0;
    const cgstAmount = (subTotal * cgstPercent) / 100;
    const sgstAmount = (subTotal * sgstPercent) / 100;
    const discount = parseFloat(jewelData.discount) || 0;
    const totalAmount = subTotal + cgstAmount + sgstAmount - discount;
    
    // Create the main jewel record with calculated values
    const jewel = await models.OldJewel.create({
      ...jewelData,
      sub_total_amount: subTotal,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      total_amount: totalAmount,
      date: jewelData.date || new Date().toISOString().split('T')[0]
    }, { transaction });
    
    // Create jewel items if any
    if (items && items.length > 0) {
      const jewelItems = items.map(item => ({
        ...item,
        old_jewel_id: jewel.id,
        grs_weight: parseFloat(item.grs_weight) || 0,
        dust_weight: parseFloat(item.dust_weight) || 0,
        net_weight: parseFloat(item.net_weight) || 0,
        rate: parseFloat(item.rate) || 0,
        amount: parseFloat(item.amount) || 0
      }));
      
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
    const { page = 1, pageSize = 10 } = req.query;
    const limit = parseInt(pageSize, 10);
    const offset = (page - 1) * limit;

    // Fetch main jewel records
    const { count, rows: jewels } = await models.OldJewel.findAndCountAll({
      offset,
      limit,
      order: [['id', 'DESC']],
      raw: true,
    });

    if (jewels.length === 0) {
      return commonService.okResponse(res, {
        data: [],
        pagination: { total: 0, page, pageSize: limit, totalPages: 0 },
      });
    }

    // Collect unique employee IDs
    const employeeIds = [...new Set(jewels.map(j => j.employee_id))];

    // Fetch employees (only needed fields)
    const employees = await models.Employee.findAll({
      where: { id: employeeIds },
      attributes: ['id', 'employee_no', 'employee_name'],
      raw: true,
    });

    // Map employee info by ID for fast lookup
    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.id] = emp;
      return acc;
    }, {});

    // Fetch items for all jewels
    const jewelIds = jewels.map(j => j.id);
    const items = await models.OldJewelItem.findAll({
      where: { old_jewel_id: jewelIds },
      raw: true,
    });

    // Group items by jewel ID
    const itemsMap = items.reduce((acc, item) => {
      if (!acc[item.old_jewel_id]) acc[item.old_jewel_id] = [];
      acc[item.old_jewel_id].push(item);
      return acc;
    }, {});

    // Merge all data
    const result = jewels.map(jewel => ({
      ...jewel,
      employee_no: employeeMap[jewel.employee_id]?.employee_no || null,
      employee_name: employeeMap[jewel.employee_id]?.employee_name || null,
      items: itemsMap[jewel.id] || [],
    }));

    // Pagination info
    const pagination = {
      total: count,
      page: parseInt(page, 10),
      pageSize: limit,
      totalPages: Math.ceil(count / limit),
    };

    return commonService.okResponse(res, { data: result, pagination });
  } catch (error) {
    console.error('Error fetching Old Jewels:', error);
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

    // --- Recalculate totals if item data is passed ---
    if (items.length > 0) {
      const subTotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
      const cgstPercent = parseFloat(updateData.cgst_percent) || 0;
      const sgstPercent = parseFloat(updateData.sgst_percent) || 0;
      const cgstAmount = (subTotal * cgstPercent) / 100;
      const sgstAmount = (subTotal * sgstPercent) / 100;
      const discount = parseFloat(updateData.discount) || 0;
      const totalAmount = subTotal + cgstAmount + sgstAmount - discount;

      updateData.sub_total_amount = subTotal;
      updateData.cgst_amount = cgstAmount;
      updateData.sgst_amount = sgstAmount;
      updateData.total_amount = totalAmount;
    }

    // --- Update Old Jewel header fields ---
    await jewel.update(updateData, { transaction });

    // --- Update each existing item (only if ID is provided) ---
    for (const item of items) {
      if (item && item.id) {
        const existingItem = await models.OldJewelItem.findOne({
          where: { id: item.id, old_jewel_id: id },
          transaction,
        });

        if (existingItem) {
          const { id: _omit, old_jewel_id: _omit2, created_at, updated_at, deleted_at, ...updatableFields } = item;

          await existingItem.update(updatableFields, { transaction });
        }
      }
    }

    await transaction.commit();

    // --- Fetch updated record with items ---
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
  const rows = await models.OldJewel.findAll({
    attributes: ["id", "old_jewel_code"],
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
