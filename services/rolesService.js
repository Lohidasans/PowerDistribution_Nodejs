const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { Op } = require('sequelize');

// Create a new employee role
const createRole = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { role_name, department_id } = req.body;

    if (!role_name || !department_id) {
      return commonService.badRequest(res, "role_name and department_id are required");
    }

    const existingRole = await models.Role.findOne({
      where: {
        role_name: { [Op.iLike]: role_name },
        department_id
      }
    });

    if (existingRole) {
      return commonService.badRequest(
        res,
        "Role with this name already exists in this department"
      );
    }

    const role = await models.Role.create(
      { role_name, department_id },
      { transaction: t }
    );

    await t.commit();
    return commonService.createdResponse(res, { row: role });
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, "Error creating role");
  }
};


// Get all employee roles with pagination and search
const getRoles = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search, department_id } = req.query;
    const offset = (page - 1) * pageSize;

    const whereClause = {};

    if (search) {
      whereClause.role_name = { [Op.iLike]: `%${search}%` };
    }

    if (department_id) {
      whereClause.department_id = department_id;
    }

    const { count, rows } = await models.Role.findAndCountAll({
      where: whereClause,
      limit: parseInt(pageSize),
      offset: parseInt(offset),
      order: [["role_name", "ASC"]],
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
    return commonService.handleError(res, error, "Error fetching roles");
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
      return commonService.notFound(res, "Role not found");
    }

    if (req.body.role_name || req.body.department_id) {
      const existingRole = await models.Role.findOne({
        where: {
          id: { [Op.ne]: role.id },
          role_name: {
            [Op.iLike]: req.body.role_name ?? role.role_name
          },
          department_id: req.body.department_id ?? role.department_id
        }
      });

      if (existingRole) {
        return commonService.badRequest(
          res,
          "Another role with this name already exists in this department"
        );
      }
    }

    const updatedRole = await role.update(req.body, { transaction: t });
    await t.commit();
    return commonService.okResponse(res, { row: updatedRole });
  } catch (error) {
    await t.rollback();
    return commonService.handleError(res, error, "Error updating role");
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
    const { department_id } = req.query;

    if (!department_id) {
      return commonService.badRequest(
        res,
        "department_id is required"
      );
    }

    const rows = await models.Role.findAll({
      where: {
        department_id
      },
      attributes: ["id", ["role_name", "name"]],
      order: [["role_name", "ASC"]],
      paranoid: true
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