const { models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");

const createUser = async (req, res) => {
  try {
    const { email, password_hash, entity_type, entity_id, role_id } = req.body;
    if (!entity_type || entity_id === undefined || !password_hash) {
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    const user = await models.User.create({
      email,
      password_hash,
      entity_type,
      entity_id,
      role_id,
    });
    return commonService.createdResponse(res, { user });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get All Users
const listUsers = async (req, res) => {
  try {
    const { entity_id, entity_type } = req.query || {};

    const where = {};

    if (entity_id) where.entity_id = entity_id;
    if (entity_type) where.entity_type = entity_type;

    const users = await models.User.findAll({
      where,
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
};

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
  createUserByEntity: async (transaction, entity_type, entity_id, data) => {
    if (!data || typeof data !== "object")
      return { error: enMessage.failure.requiredFields };
    // Allow multiple users per entity; no uniqueness check on (entity_type, entity_id)
    if (!data.password_hash)
      return {
        error:
          enMessage.user?.passwordRequired || enMessage.failure.requiredFields,
      };
    const created = await models.User.create(
      {
        email: data.email || null,
        password_hash: data.password_hash,
        role_id: data.role_id || null,
        entity_type,
        entity_id,
      },
      { transaction }
    );
    return created;
  },
  updateUserByEntity: async (transaction, entity_type, entity_id, data) => {
    if (!data || typeof data !== "object")
      return { error: enMessage.failure.requiredFields };
    const existing = await models.User.findOne({
      where: { entity_type, entity_id },
      transaction,
    });
    if (!existing) return null; // no create on update-only path
    await existing.update(
      {
        email: data.email ?? existing.email,
        password_hash: data.password_hash ?? existing.password_hash,
        role_id: data.role_id ?? existing.role_id,
      },
      { transaction }
    );
    return existing;
  },
  // Multiple logins per entity: create-only helper
  createUsersByEntity: async (transaction, entity_type, entity_id, users) => {
    if (!Array.isArray(users) || users.length === 0) return [];
    const rows = users
      .filter((u) => u && typeof u === "object" && u.password_hash)
      .map((u) => ({
        email: u.email || null,
        password_hash: u.password_hash,
        role_id: u.role_id || null,
        entity_type,
        entity_id,
      }));
    if (!rows.length)
      return {
        error:
          enMessage.user?.passwordRequired || enMessage.failure.requiredFields,
      };
    return models.User.bulkCreate(rows, { transaction, returning: true });
  },
  // Multiple logins per entity: update-only helper (requires id)
  updateUsersByEntity: async (transaction, entity_type, entity_id, users) => {
    if (!Array.isArray(users) || users.length === 0) return [];
    const updated = [];
    for (const u of users) {
      if (!u || !u.id) continue;
      const row = await models.User.findOne({
        where: { id: u.id, entity_type, entity_id },
        transaction,
      });
      if (!row) continue;
      await row.update(
        {
          email: u.email ?? row.email,
          password_hash: u.password_hash ?? row.password_hash,
          role_id: u.role_id ?? row.role_id,
        },
        { transaction }
      );
      updated.push(row);
    }
    return updated;
  },
};
