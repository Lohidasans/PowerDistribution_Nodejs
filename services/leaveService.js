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

const getAllLeaves = async (req, res) => {
  try {
    const { start_date, end_date, search, leave_type_id } = req.query;

    // Base query
    let query = `
      SELECT 
        l.id,
        l.leave_date,
        l.leave_type_id,
        l.reason,
        l.created_at,
        l.updated_at,
        lt.leave_type_name
      FROM leaves AS l
      LEFT JOIN leave_types AS lt ON lt.id = l.leave_type_id
      WHERE 1 = 1
    `;

    const replacements = {};

    // 📅 Date range filter
    if (start_date && end_date) {
      query += ` AND l.leave_date BETWEEN :start_date AND :end_date`;
      replacements.start_date = start_date;
      replacements.end_date = end_date;
    } else if (start_date) {
      query += ` AND l.leave_date >= :start_date`;
      replacements.start_date = start_date;
    } else if (end_date) {
      query += ` AND l.leave_date <= :end_date`;
      replacements.end_date = end_date;
    }

    // 🧾 Leave type filter
    if (leave_type_id) {
      query += ` AND l.leave_type_id = :leave_type_id`;
      replacements.leave_type_id = leave_type_id;
    }

    // 🔍 Universal search (in both reason and leave_type_name)
    if (search && search.trim() !== "") {
      query += `
        AND (
          LOWER(l.reason) LIKE :search OR
          LOWER(lt.leave_type_name) LIKE :search
        )
      `;
      replacements.search = `%${search.trim().toLowerCase()}%`;
    }

    // 🕒 Order
    query += ` ORDER BY l.leave_date DESC`;

    // Execute raw query
    const leaves = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    return commonService.okResponse(res, leaves);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

module.exports = { getAllLeaves };

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
