const { models } = require("../models/index");
const commonService = require("../services/commonService");
const enMessage = require("../constants/en.json");
const bcrypt = require("bcrypt");

const createUser = async (req, res) => {
  try {
    const { email, password, entity_type, entity_id, role_id } = req.body;
    if (!entity_type || entity_id === undefined || !password) {
      return commonService.badRequest(res, enMessage.failure.requiredFields);
    }

    // Hash password before storing
    const password_hash = await bcrypt.hash(password, 10);

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
      return { error: enMessage.user.invalidPayload };
    // Allow multiple users per entity; no uniqueness check on (entity_type, entity_id)
    if (!data.password && !data.password_hash)
      return { error: enMessage.user.passwordRequired };

    try {
      // Hash password if plain password is provided
      let password_hash = data.password_hash;
      if (data.password) {
        password_hash = await bcrypt.hash(data.password, 10);
      }

      const created = await models.User.create(
        {
          email: data.email || null,
          password_hash: password_hash,
          role_id: data.role_id || null,
          entity_type,
          entity_id,
        },
        { transaction }
      );

      return { user: created };
    }
    catch (err) {
      // Handle Sequelize unique constraint errors
      if (err.name === "SequelizeUniqueConstraintError") {
        const field = Object.keys(err.fields || {})[0] || "email";
        console.log("******Duplicate email found******");
        return {
          error: `${field} already exists`,
          details: err.fields,
        };
      }

      // Other Sequelize / DB errors
      return {
        error: "Failed to create user",
        details: err.message,
      };
    }
  },
  updateUserByEntity: async (transaction, entity_type, entity_id, data) => {
    if (!data || typeof data !== "object")
      return { error: enMessage.user.invalidPayload };
    const existing = await models.User.findOne({
      where: { entity_type, entity_id },
      transaction,
    });
    if (!existing) return null; // no create on update-only path
    
    // Hash password if provided
    let password_hash = existing.password_hash;
    if (data.password) {
      password_hash = await bcrypt.hash(data.password, 10);
    } else if (data.password_hash) {
      password_hash = data.password_hash;
    }
    
    await existing.update(
      {
        email: data.email ?? existing.email,
        password_hash: password_hash,
        role_id: data.role_id ?? existing.role_id,
      },
      { transaction }
    );
    return existing;
  },
  // Multiple logins per entity: create-only helper
  createUsersByEntity: async (transaction, entity_type, entity_id, users) => {
    if (!Array.isArray(users) || users.length === 0) return [];

    // Filter only valid objects with password or password_hash and hash passwords
    const rows = [];
    for (const u of users) {
      if (!u || typeof u !== "object") continue;
      if (!u.password && !u.password_hash) continue;
      
      // Hash password if plain password is provided
      let password_hash = u.password_hash;
      if (u.password) {
        password_hash = await bcrypt.hash(u.password, 10);
      }
      
      rows.push({
        email: u.email || null,
        password_hash: password_hash,
        role_id: u.role_id || null,
        entity_type,
        entity_id,
      });
    }

    if (!rows.length) {
      return { error: enMessage.user.passwordRequired || enMessage.failure.requiredFields};
    }

    try {
      const created = await models.User.bulkCreate(rows, {
        transaction,
        returning: true,
        validate: true,        // ensures per-row validation 
        individualHooks: true, // catches individual row errors
      });

      return { users: created };
    }

    catch (err) {
      // Unique constraint error (e.g., duplicate email)
      if (err.name === "SequelizeUniqueConstraintError") {
        const field = Object.keys(err.fields || {})[0] || "email";
        console.log("******Duplicate email found in Super Admin Profile******");
        return {
          error: `${field} already exists`,
          details: err.fields,
        };
      }

      // Other DB errors
      return {
        error: "Failed to create users",
        details: err.message,
      };
    }
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
      
      // Hash password if provided
      let password_hash = row.password_hash;
      if (u.password) {
        password_hash = await bcrypt.hash(u.password, 10);
      } else if (u.password_hash) {
        password_hash = u.password_hash;
      }
      
      await row.update(
        {
          email: u.email ?? row.email,
          password_hash: password_hash,
          role_id: u.role_id ?? row.role_id,
        },
        { transaction }
      );
      updated.push(row);
    }
    return updated;
  },
};
