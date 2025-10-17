const { models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");

const createUser = async (req, res) => {
  try {
    const { email, password_hash, entity_type, entity_id, role_id } = req.body;
    if (!entity_type || entity_id === undefined || !password_hash) {
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    const user = await models.User.create({ email, password_hash, entity_type, entity_id, role_id });
    return commonService.createdResponse(res, { user });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get All Users
const listUsers = async (req, res) => {
  try {
    const users = await models.User.findAll({
      order: [["created_at", "DESC"]],
    });
    return commonService.okResponse(res, { users });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get User by ID
const getUserById = async (req, res) => {
  const entity = await commonService.findById(models.User, req.params.id, res);
  if (!entity) return;
  return commonService.okResponse(res, { user: entity });
};

// Update User
const updateUser = async (req, res) => {
  const entity = await commonService.findById(models.User, req.params.id, res);
  if (!entity) return;

  try {
    await entity.update(req.body);
    return commonService.okResponse(res, { user: entity });
  } catch (err) {
    return commonService.handleError(res, err);
  }
}

// Delete User
const deleteUser = async (req, res) => {
  const entity = await commonService.findById(models.User, req.params.id, res);
  if (!entity) return;

  try {
    await entity.destroy();
    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
};
