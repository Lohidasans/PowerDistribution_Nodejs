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
    const departmentRow = await models.EmployeeDepartment.findByPk(department_id);
    if (!departmentRow) {
      return commonService.badRequest(res, "Invalid department_id");
    }

    // Check if role with department already exists
    const existingRole = await models.Role.findOne({
      where: {
        role_name,
        department_id
      }
    });

    // If role doesn't exist, create it
    if (!existingRole) {
      await models.Role.create({
        role_name,
        department_id
      });
    }

    // Check if role permissions already exist for this role & department
    const existingPermissions = await models.RolePermission.findOne({
      where: { role_name, department_id }
    });

    if (existingPermissions) {
      return commonService.badRequest(
        res,
        `Permissions for role "${role_name}" in this department already exist`
      );
    }

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
      returning: true,
    });

    return commonService.createdResponse(res, {
      message: "Role Permissions Created",
      created_permissions: createdRecords,
      role_created: !existingRole // Indicates if a new role was created
    });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Get Role Permission by ID (WITHOUT ASSOCIATIONS)
const getRolePermissionById = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get the role permission
    const rolePermission = await models.RolePermission.findOne({
      where: { id },
      raw: true
    });

    if (!rolePermission) {
      return commonService.notFoundResponse(res, "Role permission not found");
    }

    // 2. Manual lookup for the Module
    const moduleData = await models.Module.findOne({
      where: { id: rolePermission.module_id },
      raw: true,
      attributes: ["id", "module_name"]
    });

    // 3️. Manual lookup for the Access Level
    const accessLevelData = await models.AccessLevel.findOne({
      where: { id: rolePermission.access_level_id },
      raw: true,
      attributes: ["id", "access_name"]
    });

    // 4️. Manual lookup for Employee Department
    const departmentData = await models.EmployeeDepartment.findOne({
      where: { id: rolePermission.department_id },
      raw: true,
      attributes: ["id", "department_name"]
    });

    // 5️. Build response object manually
    const finalResult = {
      ...rolePermission,
      module: moduleData || null,
      accessLevel: accessLevelData || null,
      department: departmentData || null,
    };

    return commonService.okResponse(res, { role_permission: finalResult });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Update multiple RolePermission rows by id
const updateRolePermissionsBulk = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { role_name, department_id, permissions = [] } = req.body;

    if (!role_name || !department_id) {
      return commonService.badRequest(res, "role_name and department_id are required");
    }

    if (!Array.isArray(permissions)) {
      return commonService.badRequest(res, "permissions must be an array");
    }

    // Check if role with department exists, if not create it
    let role = await models.Role.findOne({
      where: {
        role_name,
        department_id
      },
      transaction
    });

    if (!role) {
      role = await models.Role.create({
        role_name,
        department_id
      }, { transaction });
    }

    const updatedRows = [];
    const createdRows = [];
    const createdIds = []; // collect IDs of newly created records

    // 1. Handle Updates and Creates
    for (const p of permissions) {
      if (p.id) {
        // UPDATE
        const record = await models.RolePermission.findByPk(p.id, {
          transaction,
          paranoid: false,
        });

        if (!record) {
          await transaction.rollback();
          return commonService.badRequest(res, `Permission ID ${p.id} not found`);
        }

        if (record.role_name !== role_name || record.department_id !== department_id) {
          await transaction.rollback();
          return commonService.badRequest(
            res,
            `Permission ID ${p.id} does not belong to role '${role_name}' in department ${department_id}`
          );
        }

        await record.update(
          {
            module_id: p.module_id ?? record.module_id,
            access_level_id: p.access_level_id ?? record.access_level_id,
            deleted_at: null, // restore if soft-deleted
          },
          { transaction }
        );

        updatedRows.push(record);
      } else {
        // CREATE
        if (!p.module_id || !p.access_level_id) {
          await transaction.rollback();
          return commonService.badRequest(
            res,
            "module_id and access_level_id are required for new permissions"
          );
        }

        const newRecord = await models.RolePermission.create(
          {
            module_id: p.module_id,
            access_level_id: p.access_level_id,
            role_name,
            department_id,
          },
          { transaction }
        );

        createdRows.push(newRecord);
        createdIds.push(newRecord.id); // Collect new IDs
      }
    }

    // 2. Soft-delete only existing records that were NOT sent in payload
    // (Exclude newly created IDs)
    const incomingIds = permissions
      .filter(p => p.id)
      .map(p => p.id);

    const protectedIds = [...incomingIds, ...createdIds];

    let softDeletedCount = 0;

    if (protectedIds.length > 0) {
      const [count] = await models.RolePermission.update(
        { deleted_at: new Date() },
        {
          where: {
            role_name,
            department_id,
            id: { [Op.notIn]: protectedIds },
          },
          transaction,
          paranoid: false,
        }
      );
      softDeletedCount = count;
    } else {
      // If no IDs sent at all, delete all for this role/dept
      const [count] = await models.RolePermission.update(
        { deleted_at: new Date() },
        {
          where: { role_name, department_id },
          transaction,
          paranoid: false,
        }
      );
      softDeletedCount = count;
    }

    await transaction.commit();

    // Fetch final active permissions for response
    const activePermissions = await models.RolePermission.findAll({
      where: { role_name, department_id, deleted_at: null },
      order: [["module_id", "ASC"]],
      raw: true,
    });

    return commonService.okResponse(res, {
      message: "Role permissions updated successfully",
      role_name,
      department_id,
      updated: updatedRows.length,
      created: createdRows.length,
      softDeletedCount,
      activePermissions,
      role_created: !role.createdAt || role.updatedAt > new Date(Date.now() - 1000) // Check if role was just created
    });
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

// List Role Access Page(department, role, members, access_control) for UI
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

// List the selected permisions by using rolename and department_id
const getRolePermissions = async (req, res) => {
  try {
    const { role_name, department_id } = req.query;

    if (!role_name || !department_id) {
      return commonService.badRequest(res, "role_name and department_id are required");
    }

    // 1️⃣ Fetch permissions for role + department
    const permissions = await models.RolePermission.findAll({
      where: { role_name, department_id }
    });

    if (!permissions.length) {
      return commonService.okResponse(res, { data: [] });
    }

    // Extract module_ids & access_level_ids
    const moduleIds = [...new Set(permissions.map(p => p.module_id))];
    const accessLevelIds = [...new Set(permissions.map(p => p.access_level_id))];

    // 2️⃣ Fetch modules
    const modules = await models.Module.findAll({
      where: { id: moduleIds }
    });

    // 3️⃣ Extract module_group_ids and fetch groups
    const groupIds = [...new Set(modules.map(m => m.module_group_id))];

    const moduleGroups = await models.ModuleGroup.findAll({
      where: { id: groupIds }
    });

    // 4️⃣ Fetch access levels
    const accessLevels = await models.AccessLevel.findAll({
      where: { id: accessLevelIds }
    });

    // 5️⃣ Merge data manually
    const result = permissions.map(p => {
      const moduleData = modules.find(m => m.id === p.module_id);
      const groupData = moduleGroups.find(g => g.id === moduleData.module_group_id);
      const accessData = accessLevels.find(a => a.id === p.access_level_id);

      return {
        ...p.toJSON(),
        module: moduleData,
        module_group: groupData,
        access_level: accessData
      };
    });

    // Transform the result to the desired format
    const formattedModules = result.map(item => ({
      id: item.id,
      module_id: item.module_id,
      module_name: item.module.module_name,
      module_group_id: item.module_group.id,
      module_group_name: item.module_group.module_group_name,
      access_level_id: item.access_level_id
    }));

    return commonService.okResponse(res, {
      message: "Role Permissions Fetched",
      data: {
        modules: formattedModules
      }
    });

  } catch (err) {
    return commonService.handleError(res, err);
  }
};



module.exports = {
  deleteRolePermissions, 
  createRolePermissionsBulk, 
  updateRolePermissionsBulk, 
  getRolePermissionById,
  listAccess,
  getRolePermissions
};
