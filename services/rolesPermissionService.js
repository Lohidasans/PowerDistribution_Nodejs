const { models, sequelize } = require("../models/index");
const { Op } = require("sequelize");
const commonService = require("../services/commonService");
const message = require("../constants/en.json");

// New method: Delete All Permissions for a Role
const deleteRolePermissions = async (roleName) => {
  return await models.RolePermission.destroy({
    where: { role_name: roleName },
  });
};

// Create a single Role Permission row (module_id, access_level_id, role_name, department_id)
const createRolePermissionsBulk = async (req, res) => {
  try {
    const { role_name, department_id, permissions } = req.body;

    if (!role_name || !department_id || !Array.isArray(permissions)) {
      return commonService.badRequest(res, "Missing required fields");
    }

    // Validate department exists
    const departmentRow = await models.EmployeeDepartment.findByPk(
      department_id
    );
    if (!departmentRow)
      return commonService.badRequest(res, "Invalid department_id");

    // Validate all modules & access levels exist
    const moduleIds = permissions.map((p) => p.module_id);
    const accessLevelIds = permissions.map((p) => p.access_level_id);

    const [validModules, validAccessLevels] = await Promise.all([
      models.Module.findAll({ where: { id: moduleIds } }),
      models.AccessLevel.findAll({ where: { id: accessLevelIds } }),
    ]);

    // Check for invalid modules
    const validModuleIds = validModules.map(m => m.id);
    const invalidModuleIds = moduleIds.filter(id => !validModuleIds.includes(id));

    if (invalidModuleIds.length > 0) {
      return commonService.badRequest(
        res,
        `Invalid module_id(s): ${invalidModuleIds.join(', ')}. Valid module IDs are: ${validModuleIds.join(', ')}`
      );
    }

    // Check for invalid access levels
    const validAccessLevelIds = validAccessLevels.map(a => a.id);
    const invalidAccessLevelIds = accessLevelIds.filter(id => !validAccessLevelIds.includes(id));

    if (invalidAccessLevelIds.length > 0) {
      return commonService.badRequest(
        res,
        `Invalid access_level_id(s): ${invalidAccessLevelIds.join(', ')}. Valid access level IDs are: ${validAccessLevelIds.join(', ')}`
      );
    }

    // Prepare bulk insert payload
    const records = permissions.map((p) => ({
      role_name,
      department_id,
      module_id: p.module_id,
      access_level_id: p.access_level_id,
    }));

    // Insert & RETURN created rows
    const createdRecords = await models.RolePermission.bulkCreate(records, {
      returning: true, // IMPORTANT ✅
    });

    return commonService.createdResponse(res, {
      message: "Role Permissions Created",
      created_permissions: createdRecords, 
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update multiple RolePermission rows by id
const updateRolePermissionsBulk = async (req, res) => {
  try {
    const { permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return commonService.badRequest(res, "permissions must be a non-empty array");
    }

    // Extract IDs
    const ids = permissions.map(p => p.id);

    // Fetch existing rows
    const existingRecords = await models.RolePermission.findAll({
      where: { id: ids }
    });

    if (existingRecords.length !== ids.length) {
      const existingIds = existingRecords.map(r => r.id);
      const missing = ids.filter(id => !existingIds.includes(id));
      return commonService.badRequest(
        res,
        `Some ids not found: ${missing.join(", ")}`
      );
    }

    // Validate access levels & modules if present
    const accessIds = [...new Set(permissions.map(p => p.access_level_id).filter(Boolean))];
    const moduleIds = [...new Set(permissions.map(p => p.module_id).filter(Boolean))];

    if (accessIds.length > 0) {
      const found = await models.AccessLevel.findAll({ where: { id: accessIds } });
      if (found.length !== accessIds.length) {
        const valid = found.map(a => a.id);
        const invalid = accessIds.filter(id => !valid.includes(id));
        return commonService.badRequest(res, `Invalid access_level_id(s): ${invalid.join(", ")}`);
      }
    }

    if (moduleIds.length > 0) {
      const found = await models.Module.findAll({ where: { id: moduleIds } });
      if (found.length !== moduleIds.length) {
        const valid = found.map(m => m.id);
        const invalid = moduleIds.filter(id => !valid.includes(id));
        return commonService.badRequest(res, `Invalid module_id(s): ${invalid.join(", ")}`);
      }
    }

    // Update each record
    const updatedRows = [];
    for (const item of permissions) {
      const row = existingRecords.find(r => r.id === item.id);
      if (!row) continue;

      if (item.access_level_id) row.access_level_id = item.access_level_id;
      if (item.module_id) row.module_id = item.module_id;
      if (item.department_id) row.department_id = item.department_id;
      if (item.role_name) row.role_name = item.role_name;

      await row.save();
      updatedRows.push(row);
    }

    return commonService.okResponse(res, {
      message: "Role Permissions Updated",
      updated_permissions: updatedRows
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


// List Role Access (department, role, members, access_control) for UI
const listAccess = async (req, res) => {
  try {
    const { department_id, search, role } = req.query;

    let replacements = {};
    let filterClause = "";

    // Filter by department
    if (department_id) {
      filterClause += ` AND rp.department_id = :department_id`;
      replacements.department_id = department_id;
    }

    if (role) {
      filterClause += ` AND rp.role_name = :role`;
      replacements.role = role;
    }

    // Search across department, role, access_control text
    if (search) {
      filterClause += `
        AND (
          d.department_name ILIKE :search OR
          rp.role_name ILIKE :search OR
          mg.module_group_name ILIKE :search
        )
      `;
      replacements.search = `%${search}%`;
    }
    const query = `
      SELECT 
        d.id AS department_id,
        d.department_name AS department,
        rp.role_name AS role,
        COALESCE(COUNT(DISTINCT u.id), 0) AS members,
        COALESCE(STRING_AGG(DISTINCT mg.module_group_name, ', ' ORDER BY mg.module_group_name), '') AS access_control
      FROM role_permissions rp
      LEFT JOIN employee_departments d ON d.id = rp.department_id
      LEFT JOIN modules m ON m.id = rp.module_id
      LEFT JOIN module_groups mg ON mg.id = m.module_group_id
      LEFT JOIN users u ON u.role_id IS NOT NULL AND u.entity_type = 'employee'
      LEFT JOIN employees e ON e.id = u.entity_id AND e.department_id = rp.department_id
      WHERE rp.deleted_at IS NULL
       ${filterClause}
      GROUP BY d.id, d.department_name, rp.role_name
      ORDER BY d.department_name, rp.role_name;
    `;
    const [rows] = await sequelize.query(query, {replacements});
    return commonService.okResponse(res, { items: rows });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};


module.exports = {
  deleteRolePermissions, 
  createRolePermissionsBulk, 
  updateRolePermissionsBulk, 
  listAccess,
};
