const { models } = require("../models");
const commonService = require("./commonService");

// Create a new leave type
const createLeaveType = async (req, res) => {
  const transaction = await models.sequelize.transaction();
  try {
    const { leave_type_name } = req.body;
    
    // Check if leave type with same name already exists
    const existingType = await models.leave_type.findOne({
      where: { leave_type_name },
      paranoid: false
    });

    if (existingType) {
      await transaction.rollback();
      return commonService.conflict(res, 'Leave type with this name already exists');
    }

    const leaveType = await models.leave_type.create(
      { leave_type_name },
      { transaction }
    );

    await transaction.commit();
    return commonService.createdResponse(res, leaveType);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get all leave types
const getAllLeaveTypes = async (req, res) => {
  try {
    const { is_active } = req.query;
    const whereClause = {};
    
    // Filter by active status if provided
    if (is_active !== undefined) {
      whereClause.is_active = is_active === 'true';
    }

    const leaveTypes = await models.leave_type.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      paranoid: false
    });

    return commonService.okResponse(res, leaveTypes);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Get leave type by ID
const getLeaveTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const leaveType = await models.leave_type.findByPk(id, {
      paranoid: false
    });

    if (!leaveType) {
      return commonService.notFound(res, 'Leave type not found');
    }

    return commonService.okResponse(res, leaveType);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update leave type
const updateLeaveType = async (req, res) => {
  const transaction = await models.sequelize.transaction();
  try {
    const { id } = req.params;
    const { leave_type_name } = req.body;
    
    const leaveType = await models.leave_type.findByPk(id, { transaction });
    
    if (!leaveType) {
      await transaction.rollback();
      return commonService.notFound(res, 'Leave type not found');
    }

    // Check if another leave type with the same name exists
    if (leave_type_name && leave_type_name !== leaveType.leave_type_name) {
      const existingType = await models.leave_type.findOne({
        where: { leave_type_name },
        paranoid: false
      });

      if (existingType) {
        await transaction.rollback();
        return commonService.conflict(res, 'Another leave type with this name already exists');
      }
    }
    
    await leaveType.update({ leave_type_name }, { transaction });
    await transaction.commit();
    
    const updatedLeaveType = await models.leave_type.findByPk(id);
    return commonService.okResponse(res, updatedLeaveType);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Delete leave type (soft delete)
const deleteLeaveType = async (req, res) => {
  const transaction = await models.sequelize.transaction();
  try {
    const { id } = req.params;
    
    const leaveType = await models.leave_type.findByPk(id, { transaction });
    
    if (!leaveType) {
      await transaction.rollback();
      return commonService.notFound(res, 'Leave type not found');
    }

    // Check if there are any leaves associated with this type
    const associatedLeaves = await models.Leave.count({
      where: { leave_type_id: id },
      transaction
    });

    if (associatedLeaves > 0) {
      await transaction.rollback();
      return commonService.badRequest(res, 'Cannot delete leave type as it is associated with existing leave records');
    }

    await leaveType.destroy({ transaction });
    await transaction.commit();
    
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createLeaveType,
  getAllLeaveTypes,
  getLeaveTypeById,
  updateLeaveType,
  deleteLeaveType
};
