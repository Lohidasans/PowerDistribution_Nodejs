const { models, sequelize } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");
const roles = require("../models/roles");

// Assign Multiple Permissions to a Role
const create = async (req, res) => {
  try {
    const { role_id, permission_ids } = req.body;

    // Check if role exists
    const roleExists = await models.Role.findByPk(role_id);
    if (!roleExists) {
      return commonService.badRequest(res, message.roles.notExist);
    }

    // Check if all permission IDs exist
    const existingPermissions = await models.Permission.findAll({
      where: { id: permission_ids },
    });
    if (existingPermissions.length !== permission_ids.length) {
      return commonService.badRequest(res, message.rolesPermissions.duplicateIdsFound);
    }

    // Remove existing permissions for the role
    await models.RolePermission.destroy({ where: { role_id } });

    // Assign new permissions
    const rolePermissions = await models.RolePermission.bulkCreate(
      permission_ids.map((permission_id) => ({ role_id, permission_id }))
    );

    return commonService.createdResponse(res, { rolePermissions });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List Permissions by Role ID
const listByRole = async (req, res) => {
  try {
    const { role_id } = req.params;
    const rolePermissions = await models.RolePermission.findAll({
      where: { role_id },
    });
    return commonService.okResponse(res, { rolePermissions });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Role Permission by ID
const getById = async (req, res) => {
  try {
    const rolePermission = await commonService.findById(
      models.RolePermission,
      req.params.id,
      res
    );
    if (!rolePermission) return;
    return commonService.okResponse(res, { rolePermission });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// List All Permissions with Assigned Roles (Raw Query)
const listPermissionsWithRoles = async (req, res) => {
  try {
    const query = `
    SELECT 
      p.id AS permission_id, 
      p.permission_name, 
      COALESCE(
        JSON_AGG(
          CASE 
            WHEN r.id IS NOT NULL THEN 
              JSON_BUILD_OBJECT(
                'role_id', r.id, 
                'role_name', r.role_name
              )
            ELSE NULL 
          END
          ORDER BY r.id
        ) FILTER (WHERE r.id IS NOT NULL), '[]'
      ) AS roles
    FROM permissions p
    LEFT JOIN role_permissions rp ON p.id = rp.permission_id
    LEFT JOIN roles r ON rp.role_id = r.id
    GROUP BY p.id, p.permission_name
    ORDER BY p.id;
  `;
    const [results] = await sequelize.query(query);
    return commonService.okResponse(res, { permissions: results });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = {
  create,
  listByRole,
  getById,
  listPermissionsWithRoles,
};
