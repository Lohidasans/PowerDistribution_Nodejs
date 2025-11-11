const { sequelize, models } = require("../models");
const commonService = require("./commonService");
const { Op } = require('sequelize');

// Create a new leave request
const createLeave = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { leave_date, leave_type_id, reason } = req.body;
    
    const leave = await models.Leave.create(
      { 
        leave_date, 
        leave_type_id, 
        reason,
      },
      { transaction }
    );

    await transaction.commit();
    return commonService.createdResponse(res, leave);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get all leave requests with optional filtering
const getAllLeaves = async (req, res) => {
  try {
    const { start_date, end_date, status, leave_type_id, employee_id } = req.query;
    const whereClause = {};

    // Date range filter
    if (start_date && end_date) {
      whereClause.leave_date = {
        [Op.between]: [start_date, end_date],
      };
    } else if (start_date) {
      whereClause.leave_date = { [Op.gte]: start_date };
    } else if (end_date) {
      whereClause.leave_date = { [Op.lte]: end_date };
    }

    // Leave type filter
    if (leave_type_id) {
      whereClause.leave_type_id = leave_type_id;
    }

    const leaves = await models.Leave.findAll({
      where: whereClause,
      order: [['leave_date', 'DESC']],
      paranoid: false // Include soft-deleted records if needed
    });

    return commonService.okResponse(res, leaves);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Get leave by ID
const getLeaveById = async (req, res) => {
  try {
    const { id } = req.params;
    const leave = await models.Leave.findByPk(id, {
      paranoid: false
    });

    if (!leave) {
      return commonService.notFound(res, 'Leave request not found');
    }

    return commonService.okResponse(res, leave);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update leave request
const updateLeave = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { leave_date, leave_type_id, reason } = req.body;

    const leave = await models.Leave.findByPk(id, { transaction });
    if (!leave) {
      await transaction.rollback();
      return commonService.notFound(res, 'Leave request not found');
    }

    // Prepare updated data
    const updateData = {
      leave_date: leave_date || leave.leave_date,
      leave_type_id: leave_type_id || leave.leave_type_id,
      reason: reason !== undefined ? reason : leave.reason
    };

    // Update record
    await leave.update(updateData, { transaction });
    await transaction.commit();

    // Fetch updated record (without associations)
    const updatedLeave = await models.Leave.findByPk(id);

    return commonService.okResponse(res, updatedLeave);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};


// Delete leave request (soft delete)
const deleteLeave = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const leave = await models.Leave.findByPk(id, { transaction });
    
    if (!leave) {
      await transaction.rollback();
      return commonService.notFound(res, 'Leave request not found');
    }

    // Only allow deletion if status is pending
    if (leave.status !== 'pending') {
      await transaction.rollback();
      return commonService.badRequest(res, 'Only pending leave requests can be deleted');
    }

    await leave.destroy({ transaction });
    await transaction.commit();
    
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createLeave,
  getAllLeaves,
  getLeaveById,
  updateLeave,
  deleteLeave,
};
