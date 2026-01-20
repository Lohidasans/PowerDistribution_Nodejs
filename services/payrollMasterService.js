const { models, sequelize } = require("../models");
const commonService = require('./commonService');
const { Op } = require('sequelize');

// Create a new payroll master
const createPayrollMaster = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { payroll_master_type_id, pay_type_name, calculation_type_id, payroll_value, branch_id } = req.body;

        // Check if payroll master with same name already exists
        const existingPayroll = await models.PayrollMaster.findOne({
            where: {
                pay_type_name: {
                    [Op.iLike]: pay_type_name
                }
            }
        });

        if (existingPayroll) {
            return commonService.badRequest(res, 'Payroll master with this name already exists');
        }

        const payrollMaster = await models.PayrollMaster.create({
            payroll_master_type_id,
            pay_type_name,
            calculation_type_id,
            payroll_value,
            branch_id
        }, { transaction: t });

        await t.commit();
        return commonService.createdResponse(res, { row: payrollMaster });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error creating payroll master');
    }
};

// Create multiple payroll masters in bulk
const createPayrollMasterBulk = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { payroll_masters } = req.body;

        if (!Array.isArray(payroll_masters) || payroll_masters.length === 0) {
            return commonService.badRequest(res, 'payroll_masters array is required and cannot be empty');
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < payroll_masters.length; i++) {
            const item = payroll_masters[i];
            const { payroll_master_type_id, pay_type_name, calculation_type_id, payroll_value, branch_id } = item;

            try {
                // Check if payroll master with same name already exists
                const existingPayroll = await models.PayrollMaster.findOne({
                    where: {
                        pay_type_name: {
                            [Op.iLike]: pay_type_name
                        }
                    }
                });

                if (existingPayroll) {
                    errors.push({
                        index: i,
                        pay_type_name,
                        error: 'Payroll master with this name already exists'
                    });
                    continue;
                }

                const payrollMaster = await models.PayrollMaster.create({
                    payroll_master_type_id,
                    pay_type_name,
                    calculation_type_id,
                    payroll_value,
                    branch_id
                }, { transaction: t });

                results.push(payrollMaster);
            } catch (itemError) {
                errors.push({
                    index: i,
                    pay_type_name,
                    error: itemError.message
                });
            }
        }

        await t.commit();
        return commonService.okResponse(res, {
            message: `Successfully created ${results.length} payroll masters`,
            created: results,
            failed: errors,
            summary: {
                total: payroll_masters.length,
                successful: results.length,
                failed: errors.length
            }
        });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error creating payroll masters in bulk');
    }
};

// Get all payroll masters with pagination and search
const getPayrollMasters = async (req, res) => {
    try {
        const { page = 1, pageSize = 10, search } = req.query;
        const offset = (page - 1) * pageSize;

        const whereClause = {};
        if (search) {
            whereClause.pay_type_name = {
                [Op.iLike]: `%${search}%`
            };
        }

        const { count, rows } = await models.PayrollMaster.findAndCountAll({
            where: whereClause,
            limit: parseInt(pageSize),
            offset: parseInt(offset),
            order: [['pay_type_name', 'ASC']],
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
        return commonService.handleError(res, error, 'Error fetching payroll masters');
    }
};

// Get payroll master by ID
const getPayrollMasterById = async (req, res) => {
    try {
        const payrollMaster = await models.PayrollMaster.findByPk(req.params.id);
        if (!payrollMaster) {
            return commonService.notFound(res, 'Payroll master not found');
        }
        return commonService.okResponse(res, { data: payrollMaster });
    } catch (error) {
        return commonService.handleError(res, error, 'Error fetching payroll master');
    }
};

// Update payroll master
const updatePayrollMaster = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const payrollMaster = await models.PayrollMaster.findByPk(req.params.id);
        if (!payrollMaster) {
            return commonService.notFound(res, 'Payroll master not found');
        }

        // Check if another payroll master with the same name exists
        if (req.body.pay_type_name) {
            const existingPayroll = await models.PayrollMaster.findOne({
                where: {
                    id: { [Op.ne]: req.params.id },
                    pay_type_name: {
                        [Op.iLike]: req.body.pay_type_name
                    }
                }
            });

            if (existingPayroll) {
                return commonService.badRequest(res, 'Another payroll master with this name already exists');
            }
        }

        const updatedPayrollMaster = await payrollMaster.update(req.body, { transaction: t });
        await t.commit();
        return commonService.okResponse(res, { row: updatedPayrollMaster });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error updating payroll master');
    }
};

// Update multiple payroll masters in bulk
const updatePayrollMasterBulk = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { payroll_masters } = req.body;

        if (!Array.isArray(payroll_masters) || payroll_masters.length === 0) {
            return commonService.badRequest(res, 'payroll_masters array is required and cannot be empty');
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < payroll_masters.length; i++) {
            const item = payroll_masters[i];
            const { id, ...updateData } = item;

            try {
                if (!id) {
                    errors.push({
                        index: i,
                        error: 'ID is required for update'
                    });
                    continue;
                }

                const payrollMaster = await models.PayrollMaster.findByPk(id);
                if (!payrollMaster) {
                    errors.push({
                        index: i,
                        id,
                        error: 'Payroll master not found'
                    });
                    continue;
                }

                // Check if another payroll master with the same name exists
                if (updateData.pay_type_name) {
                    const existingPayroll = await models.PayrollMaster.findOne({
                        where: {
                            id: { [Op.ne]: id },
                            pay_type_name: {
                                [Op.iLike]: updateData.pay_type_name
                            }
                        }
                    });

                    if (existingPayroll) {
                        errors.push({
                            index: i,
                            id,
                            pay_type_name: updateData.pay_type_name,
                            error: 'Another payroll master with this name already exists'
                        });
                        continue;
                    }
                }

                const updatedPayrollMaster = await payrollMaster.update(updateData, { transaction: t });
                results.push(updatedPayrollMaster);
            } catch (itemError) {
                errors.push({
                    index: i,
                    id: item.id,
                    error: itemError.message
                });
            }
        }

        await t.commit();
        return commonService.okResponse(res, {
            message: `Successfully updated ${results.length} payroll masters`,
            updated: results,
            failed: errors,
            summary: {
                total: payroll_masters.length,
                successful: results.length,
                failed: errors.length
            }
        });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error updating payroll masters in bulk');
    }
};

// Delete payroll master (soft delete)
const deletePayrollMaster = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const payrollMaster = await models.PayrollMaster.findByPk(req.params.id);
        if (!payrollMaster) {
            return commonService.notFound(res, 'Payroll master not found');
        }

        await payrollMaster.destroy({ transaction: t });
        await t.commit();
        return commonService.noContentResponse(res);
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error, 'Error deleting payroll master');
    }
};

module.exports = {
    createPayrollMaster,
    createPayrollMasterBulk,
    getPayrollMasters,
    getPayrollMasterById,
    updatePayrollMaster,
    updatePayrollMasterBulk,
    deletePayrollMaster
};
