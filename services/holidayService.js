const { sequelize, models } = require("../models/index");
const commonService = require("./commonService");
const { Op, literal } = require('sequelize');

// Create a new holiday
const createHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { holiday_date, holiday_name, description } = req.body;
    
    const holiday = await models.Holiday.create(
      { holiday_date, holiday_name, description },
      { transaction }
    );

    await transaction.commit();
    return commonService.createdResponse(res, holiday);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get all holidays with optional filtering
const getAllHolidays = async (req, res) => {
  try {
    const { year, month } = req.query;
    const whereClause = {};

    if (year) {
      whereClause[Op.and] = [
        sequelize.where(
          literal(`EXTRACT(YEAR FROM "holiday_date")`),
          year
        )
      ];
    }

    if (month) {
      whereClause[Op.and] = [
        ...(whereClause[Op.and] || []),
        sequelize.where(
          literal(`EXTRACT(MONTH FROM "holiday_date")`),
          month
        )
      ];
    }
    const holidays = await models.Holiday.findAll({
      where: whereClause,
      order: [['holiday_date', 'ASC']],
      paranoid: false // Include soft-deleted records if needed
    });

    return commonService.okResponse(res, holidays);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Get holiday by ID
const getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await models.Holiday.findByPk(id, { paranoid: false });

    if (!holiday) {
      return commonService.notFound(res, 'Holiday not found');
    }

    return commonService.okResponse(res, holiday);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

// Update holiday
const updateHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { holiday_date, holiday_name, description } = req.body;
    
    const holiday = await models.Holiday.findByPk(id, { transaction });
    if (!holiday) {
      await transaction.rollback();
      return commonService.notFound(res, 'Holiday not found');
    }
    
    await holiday.update(
      {
        holiday_date: holiday_date || holiday.holiday_date,
        holiday_name: holiday_name || holiday.holiday_name,
        description: description !== undefined ? description : holiday.description
      },
      { transaction }
    );

    await transaction.commit();
    const updatedHoliday = await models.Holiday.findByPk(id);
    
    return commonService.okResponse(res, updatedHoliday);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Delete holiday (soft delete)
const deleteHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const holiday = await models.Holiday.findByPk(id, { transaction });
    
    if (!holiday) {
      await transaction.rollback();
      return commonService.notFound(res, 'Holiday not found');
    }

    await holiday.destroy({ transaction });
    await transaction.commit();
    
    return commonService.noContentResponse(res);
  } catch (error) {
    await transaction.rollback();
    return commonService.handleError(res, error);
  }
};

// Get holidays within a date range
const getHolidaysInRange = async (req, res) => {
  try { 
    const { start_date, end_date, search } = req.query;
    const whereClause = {};

    // 📅 Optional date filters
    if (start_date && end_date) {
      whereClause.holiday_date = {
        [Op.between]: [start_date, end_date],
      };
    } else if (start_date) {
      whereClause.holiday_date = { [Op.gte]: start_date };
    } else if (end_date) {
      whereClause.holiday_date = { [Op.lte]: end_date };
    }

    // 🔍 Optional text search across name/description
    if (search && search.trim() !== "") {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      whereClause[Op.or] = [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('holiday_name')),
          { [Op.like]: searchTerm }
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('description')),
          { [Op.like]: searchTerm }
        ),
      ];
    }

    const holidays = await models.Holiday.findAll({
      where: whereClause,
      order: [['holiday_date', 'ASC']],
      paranoid: false,
    });

    return commonService.okResponse(res, holidays);
  } catch (error) {
    return commonService.handleError(res, error);
  }
};

module.exports = {
  createHoliday,
  getAllHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
  getHolidaysInRange
};
