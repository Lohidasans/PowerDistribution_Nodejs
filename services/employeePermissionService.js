const { models, sequelize } = require("../models");
const { Op } = require("sequelize");
const commonService = require("./commonService");

const updateEmployeePermissions = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { employee_id } = req.params;
    const { department_id, role_name, permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      await transaction.rollback();
      return commonService.badRequest(res, "permissions array is required");
    }

    // 1️. Remove existing permissions for employee
    await models.EmployeePermission.destroy({
      where: { employee_id },
      force: true, // HARD delete old snapshot
      transaction,
    });

    // 2️. Prepare new snapshot
    const rows = permissions.map((p) => ({
      employee_id,
      module_id: p.module_id,
      access_level_id: p.access_level_id,
      department_id,
      role_name,
    }));

    // 3️. Insert full permission snapshot
    const permission = await models.EmployeePermission.bulkCreate(rows, {
      transaction,
    });

    await transaction.commit();

    return commonService.okResponse(res, { rows: permission });
  } catch (err) {
    await transaction.rollback();
    return commonService.handleError(res, err);
  }
};

const getEmployeePermissions = async (req, res) => {
  try {
    const { employee_id } = req.query;

    if (!employee_id) {
      return commonService.badRequest(res, "employee_id is required");
    }

    // Check if employee exists first
    const employee = await models.Employee.findByPk(employee_id, { raw: true });
    if (!employee) {
      return commonService.notFound(res, "Employee not found");
    }

    const permissions = await models.EmployeePermission.findAll({
      where: { employee_id },
      raw: true,
    });

    // If no permissions found for the employee, return empty array
    if (!permissions || permissions.length === 0) {
      return commonService.okResponse(res, []);
    }

    const moduleIds = permissions.map((p) => p.module_id);

    const [modules, moduleGroups] = await Promise.all([
      models.Module.findAll({
        where: { id: moduleIds },
        raw: true,
      }),
      models.ModuleGroup.findAll({ raw: true }),
    ]);

    const [department, designation] = await Promise.all([
      models.EmployeeDepartment.findByPk(employee.department_id, { raw: true }),
      models.Role.findByPk(employee.role_id, { raw: true }),
    ]);

    const moduleMap = Object.fromEntries(modules.map((m) => [m.id, m]));
    const groupMap = Object.fromEntries(moduleGroups.map((g) => [g.id, g]));

    const result = permissions.map((p) => ({
      id: p.id,
      module_id: p.module_id,
      access_level_id: p.access_level_id,
      module_name: moduleMap[p.module_id]?.module_name,
      module_group_id: moduleMap[p.module_id]?.module_group_id,
      module_group_name:
        groupMap[moduleMap[p.module_id]?.module_group_id]?.module_group_name,
      department_id: employee.department_id,
      department_name: department?.department_name,
      role_id: employee.role_id,
      designation_name: designation?.role_name,
    }));

    return commonService.okResponse(res, result);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

const getEmployeePermissionsWithRole = async (req, res) => {
  try {
    const { employee_id } = req.query;

    // 1️⃣ Validation
    if (!employee_id) {
      return commonService.badRequest(res, "employee_id is required");
    }

    // 2️⃣ Check employee exists
    const employee = await models.Employee.findByPk(employee_id, { raw: true });
    if (!employee) {
      return commonService.notFound(res, "Employee not found");
    }

    // 3️⃣ Fetch employee permissions
    const permissions = await models.EmployeePermission.findAll({
      where: { employee_id },
      raw: true,
    });

    // If no permissions, return empty modules
    if (!permissions || permissions.length === 0) {
      return commonService.okResponse(res, {
        message: "Role Permissions Fetched",
        data: {
          modules: [],
        },
      });
    }

    // 4️⃣ Collect module IDs
    const moduleIds = [...new Set(permissions.map((p) => p.module_id))];

    // 5️⃣ Fetch modules & module groups
    const [modules, moduleGroups] = await Promise.all([
      models.Module.findAll({
        where: { id: moduleIds },
        raw: true,
      }),
      models.ModuleGroup.findAll({ raw: true }),
    ]);

    // 6️⃣ Create lookup maps
    const moduleMap = Object.fromEntries(modules.map((m) => [m.id, m]));
    const groupMap = Object.fromEntries(moduleGroups.map((g) => [g.id, g]));

    // 7️⃣ Transform to REQUIRED response format
    const modulesResponse = [];

    permissions.forEach((perm) => {
      const module = moduleMap[perm.module_id];
      if (!module) return;

      modulesResponse.push({
        id: perm.id, // employee_permission id
        module_id: module.id,
        module_name: module.module_name,
        module_group_id: module.module_group_id,
        module_group_name:
          groupMap[module.module_group_id]?.module_group_name || null,
        access_level_id: perm.access_level_id,
      });
    });

    // 8️⃣ Final response (SECOND UPLOAD FORMAT)
    return commonService.okResponse(res, {
      message: "Role Permissions Fetched",
      data: {
        modules: modulesResponse,
      },
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

const getEmployeePermissionsOrRolePermissions = async (req, res) => {
  try {
    const { employee_id } = req.query;

    // 1️⃣ Validation
    if (!employee_id) {
      return commonService.badRequest(res, "employee_id is required");
    }

    // 2️⃣ Check employee exists and get their details
    const employee = await models.Employee.findByPk(employee_id, { raw: true });

    if (!employee) {
      return commonService.notFound(res, "Employee not found");
    }

    // 3️⃣ Try to fetch employee-specific permissions first
    let permissions = await models.EmployeePermission.findAll({
      where: { employee_id },
      raw: true,
    });

    let source = "employee_permissions";

    // 4️⃣ If no employee permissions found, fallback to role permissions
    if (!permissions || permissions.length === 0) {
      if (!employee.role_id || !employee.department_id) {
        return commonService.okResponse(res, {
          message: "No permissions found - employee has no role or department assigned",
          source: "none",
          data: {
            modules: [],
          },
        });
      }

      // Fetch role details
      const role = await models.Role.findByPk(employee.role_id, { raw: true });
      
      if (!role) {
        return commonService.okResponse(res, {
          message: "No permissions found - employee role not found",
          source: "none",
          data: {
            modules: [],
          },
        });
      }

      // Fetch role permissions based on employee's role and department
      const rolePermissions = await models.RolePermission.findAll({
        where: {
          role_name: role.role_name,
          department_id: employee.department_id,
        },
        raw: true,
      });

      if (!rolePermissions || rolePermissions.length === 0) {
        return commonService.okResponse(res, {
          message: "No permissions found for this role and department",
          source: "none",
          data: {
            modules: [],
          },
        });
      }

      permissions = rolePermissions;
      source = "role_permissions";
    }

    // 5️⃣ Collect module IDs
    const moduleIds = [...new Set(permissions.map((p) => p.module_id))];

    // 6️⃣ Fetch modules & module groups
    const [modules, moduleGroups, department, role] = await Promise.all([
      models.Module.findAll({
        where: { id: moduleIds },
        raw: true,
      }),
      models.ModuleGroup.findAll({ raw: true }),
      models.EmployeeDepartment.findByPk(employee.department_id, { raw: true }),
      employee.role_id ? models.Role.findByPk(employee.role_id, { raw: true }) : null,
    ]);

    // 7️⃣ Create lookup maps
    const moduleMap = Object.fromEntries(modules.map((m) => [m.id, m]));
    const groupMap = Object.fromEntries(moduleGroups.map((g) => [g.id, g]));

    // 8️⃣ Transform to required response format
    const modulesResponse = [];

    permissions.forEach((perm) => {
      const module = moduleMap[perm.module_id];
      if (!module) return;

      modulesResponse.push({
        id: perm.id,
        module_id: module.id,
        module_name: module.module_name,
        module_group_id: module.module_group_id,
        module_group_name:
          groupMap[module.module_group_id]?.module_group_name || null,
        access_level_id: perm.access_level_id,
      });
    });

    // 9️⃣ Final response with source indicator
    return commonService.okResponse(res, {
      message: `Permissions fetched from ${source}`,
      source: source,
      employee: {
        id: employee.id,
        name: employee.employee_name,
        department: department?.department_name || null,
        role: role?.role_name || null,
      },
      data: {
        modules: modulesResponse,
      },
    });
  } catch (err) {
    console.error(err);
    return commonService.handleError(res, err);
  }
};

module.exports = {
  updateEmployeePermissions,
  getEmployeePermissions,
  getEmployeePermissionsWithRole,
  getEmployeePermissionsOrRolePermissions,
};
