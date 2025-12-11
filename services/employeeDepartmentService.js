const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { Op } = require('sequelize');

// Create a new employee department
const createEmployeeDepartment = async (req, res) => {
    const t = await sequelize.transaction();
    console.log('Available models:', Object.keys(models));
    try {
        const { department_name } = req.body;

        // Check if department with same name already exists
        const existingDept = await models.EmployeeDepartment.findOne({
            where: {
                department_name: {
                    [Op.iLike]: department_name
                }
            }
        });

        if (existingDept) {
            return commonService.badRequest(res, 'Department with this name already exists');
        }

        const department = await models.EmployeeDepartment.create({
            department_name
        }, { transaction: t });

        await t.commit();
        return commonService.createdResponse(res, { row: department });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error creating department');
    }
};

// Get all employee departments with pagination and search
const getEmployeeDepartments = async (req, res) => {
    try {
        const { page = 1, pageSize = 10, search } = req.query;
        const offset = (page - 1) * pageSize;

        const whereClause = {};
        if (search) {
            whereClause.department_name = {
                [Op.iLike]: `%${search}%`
            };
        }

        const { count, rows } = await models.EmployeeDepartment.findAndCountAll({
            where: whereClause,
            limit: parseInt(pageSize),
            offset: parseInt(offset),
            order: [['department_name', 'ASC']],
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
        return commonService.handleError(res, error, 'Error fetching departments');
    }
};

//Get employee department by ID
const getEmployeeDepartmentById = async (req, res) => {
    try {
        const department = await models.EmployeeDepartment.findByPk(req.params.id);
        if (!department) {
            return commonService.notFound(res, 'Department not found');
        }
        return commonService.okResponse(res, { data: department });
    } catch (error) {
        return commonService.handleError(res, error, 'Error fetching department');
    }
};

// Update employee department
const updateEmployeeDepartment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const department = await models.EmployeeDepartment.findByPk(req.params.id);
        if (!department) {
            return commonService.notFound(res, 'Department not found');
        }

        // Check if another department with the same name exists
        if (req.body.department_name) {
            const existingDept = await models.EmployeeDepartment.findOne({
                where: {
                    id: { [Op.ne]: req.params.id },
                    department_name: {
                        [Op.iLike]: req.body.department_name
                    }
                }
            });

            if (existingDept) {
                return commonService.badRequest(res, 'Another department with this name already exists');
            }
        }

        const updatedDepartment = await department.update(req.body, { transaction: t });
        await t.commit();
        return commonService.okResponse(res, { row: updatedDepartment });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error updating department');
    }
};

//Delete employee department (soft delete)
const deleteEmployeeDepartment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const department = await models.EmployeeDepartment.findByPk(req.params.id);
        if (!department) {
            return commonService.notFound(res, 'Department not found');
        }

        await department.destroy({ transaction: t });
        await t.commit();
        return commonService.noContentResponse(res);
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error deleting department');
    }
};

module.exports = {
    createEmployeeDepartment,
    getEmployeeDepartments,
    getEmployeeDepartmentById,
    updateEmployeeDepartment,
    deleteEmployeeDepartment
};