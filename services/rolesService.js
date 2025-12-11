const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { Op } = require('sequelize');

// Create a new employee role
const createRole = async (req, res) => {
  const t = await sequelize.transaction();
  console.log('Available models:', Object.keys(models));
  try {
    const { role_name } = req.body;

    // Check if role with same name already exists
    const existingDept = await models.Role.findOne({
      where: {
        role_name: {
          [Op.iLike]: role_name
        }
      }
    });

    if (existingDept) {
      return commonService.badRequest(res, 'Role with this name already exists');
    }

    const role = await models.Role.create({
      role_name
    }, { transaction: t });

    await t.commit();
    return commonService.createdResponse(res, { row: role });
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, 'Error creating role');
  }
};

// Get all employee roles with pagination and search
const getRoles = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search } = req.query;
    const offset = (page - 1) * pageSize;

    const whereClause = {};
    if (search) {
      whereClause.role_name = {
        [Op.iLike]: `%${search}%`
      };
    }

    const { count, rows } = await models.Role.findAndCountAll({
      where: whereClause,
      limit: parseInt(pageSize),
      offset: parseInt(offset),
      order: [['role_name', 'ASC']],
      paranoid: true
    });

    return commonService.okResponse(res, {
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(count / pageSize)
      }
    });
  } catch (error) {
    return commonService.handleError(res, error, 'Error fetching roles');
  }
};

//Get employee role by ID
const getRoleById = async (req, res) => {
  try {
    const role = await models.Role.findByPk(req.params.id);
    if (!role) {
      return commonService.notFound(res, 'Role not found');
    }
    return commonService.okResponse(res, { data: role });
  } catch (error) {
    return commonService.handleError(res, error, 'Error fetching role');
  }
};

// Update employee role
const updateRole = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const role = await models.Role.findByPk(req.params.id);
    if (!role) {
      return commonService.notFound(res, 'Role not found');
    }

    // Check if another role with the same name exists
    if (req.body.role_name) {
      const existingDept = await models.Role.findOne({
        where: {
          id: { [Op.ne]: req.params.id },
          role_name: {
            [Op.iLike]: req.body.role_name
          }
        }
      });

      if (existingDept) {
        return commonService.badRequest(res, 'Another role with this name already exists');
      }
    }

    const updatedrole = await role.update(req.body, { transaction: t });
    await t.commit();
    return commonService.okResponse(res, { row: updatedrole });
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, 'Error updating role');
  }
};

//Delete employee role (soft delete)
const deleteRole = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const role = await models.Role.findByPk(req.params.id);
    if (!role) {
      return commonService.notFound(res, 'Role not found');
    }

    await role.destroy({ transaction: t });
    await t.commit();
    return commonService.noContentResponse(res);
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, 'Error deleting role');
  }
};

// Dropdown: Employee Roles -> [{ id, name }]
const listRolesDropdown = async (req, res) => {
  try {
    const rows = await models.Role.findAll({
      attributes: ["id", ["role_name", "name"]],
      order: [["role_name", "ASC"]],
    });
    return commonService.okResponse(res, { roles: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createRole,
  getRoles,
  getRoleById,
  updateRole,
  deleteRole,
  listRolesDropdown
};