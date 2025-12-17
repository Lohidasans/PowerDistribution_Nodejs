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

    const moduleIds = permissions.map(p => p.module_id);

    const [modules, moduleGroups] = await Promise.all([
      models.Module.findAll({
        where: { id: moduleIds },
        raw: true,
      }),
      models.ModuleGroup.findAll({ raw: true })
    ]);

    const [department, designation] = await Promise.all([
      models.EmployeeDepartment.findByPk(employee.department_id, { raw: true }),
      models.Role.findByPk(employee.designation_id, { raw: true })
    ]);

    const moduleMap = Object.fromEntries(modules.map(m => [m.id, m]));
    const groupMap = Object.fromEntries(moduleGroups.map(g => [g.id, g]));

    const result = permissions.map(p => ({
      id: p.id,
      module_id: p.module_id,
      access_level_id: p.access_level_id,
      module_name: moduleMap[p.module_id]?.module_name,
      module_group_id: moduleMap[p.module_id]?.module_group_id,
      module_group_name: groupMap[moduleMap[p.module_id]?.module_group_id]?.module_group_name,
      department_id: employee.department_id,
      department_name: department?.department_name,
      designation_id: employee.designation_id,
      designation_name: designation?.role_name,
    }));

    return commonService.okResponse(res, result);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};;


module.exports = {
  updateEmployeePermissions,
  getEmployeePermissions,
};
