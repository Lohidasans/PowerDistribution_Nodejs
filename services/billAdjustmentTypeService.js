const { models, sequelize } = require("../models");
const commonService = require("./commonService");

// Create a new bill adjustment type
const createBillAdjustmentType = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { type_name } = req.body;
    
    // Check if type with same name already exists
    const existingType = await models.BillAdjustmentType.findOne({
      where: { type_name },
      paranoid: false
    });

    if (existingType) {
      await transaction.rollback();
      return commonService.conflict(res, 'Bill adjustment type with this name already exists');
    }

    const adjustmentType = await models.BillAdjustmentType.create(
      { type_name },
      { transaction }
    );

    await transaction.commit();
    return commonService.createdResponse(res, adjustmentType);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get all bill adjustment types
const getAllBillAdjustmentTypes = async (req, res) => {
  try {
    const adjustmentTypes = await models.BillAdjustmentType.findAll({
      order: [['type_name', 'ASC']],
      attributes: ['id', 'type_name']
    });
    return commonService.okResponse(res, adjustmentTypes);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Get bill adjustment type by ID
const getBillAdjustmentTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const adjustmentType = await models.BillAdjustmentType.findByPk(id);

    if (!adjustmentType) {
      return commonService.notFound(res, 'Bill adjustment type not found');
    }

    return commonService.okResponse(res, adjustmentType);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update bill adjustment type
const updateBillAdjustmentType = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { type_name } = req.body;
    
    const adjustmentType = await models.BillAdjustmentType.findByPk(id, { transaction });
    
    if (!adjustmentType) {
      await transaction.rollback();
      return commonService.notFound(res, 'Bill adjustment type not found');
    }

    // Check if another type with the same name exists
    if (type_name && type_name !== adjustmentType.type_name) {
      const existingType = await models.BillAdjustmentType.findOne({
        where: { type_name },
        paranoid: false
      });

      if (existingType) {
        await transaction.rollback();
        return commonService.conflict(res, 'Another bill adjustment type with this name already exists');
      }
    }
    
    await adjustmentType.update({ type_name }, { transaction });
    await transaction.commit();
    
    const updatedType = await models.BillAdjustmentType.findByPk(id);
    return commonService.okResponse(res, updatedType);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Delete bill adjustment type (soft delete)
const deleteBillAdjustmentType = async (req, res) => {
  try {
    const { id } = req.params;
    
    const adjustmentType = await models.BillAdjustmentType.findByPk(id);
    if (!adjustmentType) {
          return commonService.notFound(res, "Adjustment Type not found");
        }
    await adjustmentType.destroy();
   
    return commonService.noContentResponse(res);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createBillAdjustmentType,
  getAllBillAdjustmentTypes,
  getBillAdjustmentTypeById,
  updateBillAdjustmentType,
  deleteBillAdjustmentType
};
