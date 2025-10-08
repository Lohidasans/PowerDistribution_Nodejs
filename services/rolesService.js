const { models } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");

// Create Role
const create = async (req, res) => {
  try {
    const { role_name } = req.body;

    // Check if role already exists
    const roleExists = await models.Role.findOne({ where: { role_name } });
    if (roleExists) {
      return commonService.badRequest(res);
    }

    // Create new role
    const role = await models.Role.create({ role_name });
    return commonService.createdResponse(res, { role });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List Roles with optional search
const list = async (req, res) => {
  try {
    const searchKey = req.query.search || "";

    const roles = await models.Role.findAll({
      where: searchKey ? { role_name: { [Op.iLike]: `%${searchKey}%` } } : {},
    });

    return commonService.okResponse(res, { roles });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Role by ID
const getById = async (req, res) => {
  try {
    const role = await commonService.findById(models.Role, req.params.id, res);
    if (!role) return;

    return commonService.okResponse(res, { role });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update Role
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { role_name } = req.body;

    const role = await commonService.findById(models.Role, id, res);
    if (!role) return;

    // Check if the new role_name already exists (excluding current role)
    const roleExists = await models.Role.findOne({
      where: { role_name, id: { [Op.ne]: id } },
    });

    if (roleExists) {
      return commonService.badRequest(res);
    }

    // Update role
    role.role_name = role_name;
    await role.save();

    return commonService.okResponse(res, { role });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Soft Delete Role
const remove = async (req, res) => {
  try {
    const role = await commonService.findById(models.Role, req.params.id, res);
    if (!role) return;
    await role.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
};
