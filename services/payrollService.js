const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const moment = require("moment");

/**
 * Calculate worked_days and absent_days for a given employee and pay_month
 * using the employee_tracking table.
 * 
 * @param {number} refEmployeeId  – employees.ref_employee_id
 * @param {string} payMonth       – "YYYY-MM"
 * @returns {{ worked_days, absent_days, total_days }}
 */
const calculateAttendanceForMonth = async (refEmployeeId, payMonth) => {
    const startDate = moment(payMonth, "YYYY-MM").startOf("month").format("YYYY-MM-DD");
    const endDate = moment(payMonth, "YYYY-MM").endOf("month").format("YYYY-MM-DD");

    // Count distinct dates that have at least one IN punch (status_id = 1)
    const [result] = await sequelize.query(
        `SELECT COUNT(DISTINCT date) AS worked_days
         FROM employee_tracking
         WHERE ref_employee_id = :refEmployeeId
           AND date BETWEEN :startDate AND :endDate
           AND status_id = 1`,
        {
            replacements: { refEmployeeId, startDate, endDate },
            type: sequelize.QueryTypes.SELECT,
        }
    );

    const workedDays = parseInt(result.worked_days, 10) || 0;
    // Total calendar days in the month
    const totalDays = moment(payMonth, "YYYY-MM").daysInMonth();
    const absentDays = totalDays - workedDays;

    return {
        worked_days: workedDays,
        absent_days: absentDays < 0 ? 0 : absentDays,
        total_days: totalDays,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PAYROLL
// ─────────────────────────────────────────────────────────────────────────────
const createPayroll = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const {
            pay_date,
            branch_id,
            employee_id,
            pay_month,          // "YYYY-MM"
            pf_number,
            comp_off_days = 0,
            loss_of_pay_days = 0,
            earnings = [],      // [{ payroll_master_id, amount }]
            deductions = [],    // [{ payroll_master_id, amount }]
        } = req.body;

        // Validate required fields
        if (!pay_date || !branch_id || !employee_id || !pay_month) {
            return commonService.badRequest(res, "pay_date, branch_id, employee_id, and pay_month are required");
        }

        // Validate pay_month format
        if (!moment(pay_month, "YYYY-MM", true).isValid()) {
            return commonService.badRequest(res, "pay_month must be in YYYY-MM format (e.g. 2026-02)");
        }

        // Prevent duplicate payroll for same employee + pay_month
        const existing = await models.Payroll.findOne({
            where: { employee_id, pay_month, deleted_at: null },
        });
        if (existing) {
            await t.rollback();
            return commonService.badRequest(res, "Payroll already exists for this employee and pay month");
        }

        // Fetch employee to get employee_no and ref_employee_id
        const employee = await models.Employee.findByPk(employee_id);
        if (!employee) {
            await t.rollback();
            return commonService.notFound(res, "Employee not found");
        }

        // Auto-calculate worked_days and absent_days from employee_tracking
        const attendance = await calculateAttendanceForMonth(employee.ref_employee_id, pay_month);
        const worked_days = attendance.worked_days;
        const absent_days = attendance.absent_days;

        // Compute totals
        const total_earnings = earnings.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        const total_deductions = deductions.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
        const net_salary = total_earnings - total_deductions;

        // Create header record
        const payroll = await models.Payroll.create(
            {
                pay_date,
                branch_id,
                employee_id,
                employee_no: employee.employee_no,
                pay_month,
                pf_number: pf_number || null,
                worked_days,
                absent_days,
                comp_off_days,
                loss_of_pay_days,
                total_earnings,
                total_deductions,
                net_salary,
            },
            { transaction: t }
        );

        // Create earning items
        const earningItems = earnings.map((e) => ({
            payroll_id: payroll.id,
            payroll_master_id: e.payroll_master_id,
            item_type: "earning",
            amount: parseFloat(e.amount || 0),
        }));

        // Create deduction items
        const deductionItems = deductions.map((d) => ({
            payroll_id: payroll.id,
            payroll_master_id: d.payroll_master_id,
            item_type: "deduction",
            amount: parseFloat(d.amount || 0),
        }));

        const allItems = [...earningItems, ...deductionItems];
        if (allItems.length > 0) {
            await models.PayrollItem.bulkCreate(allItems, { transaction: t });
        }

        await t.commit();
        return commonService.createdResponse(res, { row: payroll });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL PAYROLLS (with filters + pagination)
// ─────────────────────────────────────────────────────────────────────────────
const getPayrolls = async (req, res) => {
    try {
        const {
            page = 1,
            pageSize = 10,
            branch_id,
            employee_id,
            pay_month,   // exact match  e.g. "2026-02"
            month,       // e.g. "2"  or "02"
            year,        // e.g. "2026"
            search,
        } = req.query;

        const offset = (page - 1) * pageSize;
        const where = {};

        if (branch_id) where.branch_id = branch_id;
        if (employee_id) where.employee_id = employee_id;

        // pay_month exact match takes priority; otherwise build from month+year
        if (pay_month) {
            where.pay_month = pay_month;
        } else if (month && year) {
            const mm = String(month).padStart(2, '0');
            where.pay_month = `${year}-${mm}`;
        } else if (year) {
            // filter all months of a year  e.g. pay_month LIKE '2026-%'
            where.pay_month = { [Op.like]: `${year}-%` };
        } else if (month) {
            // filter a specific month across all years  e.g. pay_month LIKE '%-02'
            const mm = String(month).padStart(2, '0');
            where.pay_month = { [Op.like]: `%-${mm}` };
        }

        const { count, rows } = await models.Payroll.findAndCountAll({
            where,
            include: [
                {
                    model: models.Employee,
                    as: "employee",
                    attributes: ["id", "employee_name", "employee_no", "profile_image_url"],
                    where: search
                        ? {
                            [Op.or]: [
                                { employee_name: { [Op.iLike]: `%${search}%` } },
                                { employee_no: { [Op.iLike]: `%${search}%` } },
                            ],
                        }
                        : undefined,
                    required: !!search,
                },
                {
                    model: models.Branch,
                    as: "branch",
                    attributes: ["id", "branch_name"],
                },
            ],
            limit: parseInt(pageSize),
            offset: parseInt(offset),
            order: [["pay_month", "DESC"], ["id", "DESC"]],
            paranoid: true,
        });

        return commonService.okResponse(res, {
            data: rows,
            pagination: {
                total: count,
                page: parseInt(page),
                pageSize: parseInt(pageSize),
                totalPages: Math.ceil(count / pageSize),
            },
        });
    } catch (error) {
        return commonService.handleError(res, error);
    }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET PAYROLL BY ID (with items)
// ─────────────────────────────────────────────────────────────────────────────
const getPayrollById = async (req, res) => {
    try {
        const payroll = await models.Payroll.findByPk(req.params.id, {
            include: [
                {
                    model: models.Employee,
                    as: "employee",
                    attributes: ["id", "employee_name", "employee_no", "profile_image_url"],
                },
                {
                    model: models.Branch,
                    as: "branch",
                    attributes: ["id", "branch_name"],
                },
                {
                    model: models.PayrollItem,
                    as: "items",
                    include: [
                        {
                            model: models.PayrollMaster,
                            as: "payroll_master",
                            attributes: ["id", "pay_type_name", "payroll_master_type_id"],
                        },
                    ],
                },
            ],
        });

        if (!payroll) return commonService.notFound(res, "Payroll not found");

        const p = payroll.toJSON();

        // Helper: flatten each item so payroll_master_name is a top-level field
        const flattenItem = (item) => ({
            id: item.id,
            payroll_master_id: item.payroll_master_id,
            payroll_master_name: item.payroll_master?.pay_type_name || null,
            item_type: item.item_type,
            amount: parseFloat(item.amount || 0),
        });

        const earnings = p.items.filter((i) => i.item_type === "earning").map(flattenItem);
        const deductions = p.items.filter((i) => i.item_type === "deduction").map(flattenItem);

        const total_earnings = earnings.reduce((s, i) => s + i.amount, 0);
        const total_deductions = deductions.reduce((s, i) => s + i.amount, 0);

        return commonService.okResponse(res, {
            data: {
                id: p.id,
                pay_date: p.pay_date,
                branch_id: p.branch_id,
                branch_name: p.branch?.branch_name || null,
                employee_id: p.employee_id,
                employee_no: p.employee_no,
                employee_name: p.employee?.employee_name || null,
                profile_image_url: p.employee?.profile_image_url || null,
                pay_month: p.pay_month,
                pf_number: p.pf_number,
                worked_days: p.worked_days,
                absent_days: p.absent_days,
                comp_off_days: p.comp_off_days,
                loss_of_pay_days: p.loss_of_pay_days,
                earnings,
                deductions,
                total_earnings,
                total_deductions,
                net_salary: parseFloat(p.net_salary || 0),
                created_at: p.created_at,
                updated_at: p.updated_at,
            },
        });
    } catch (error) {
        return commonService.handleError(res, error);
    }
};


// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PAYROLL
// ─────────────────────────────────────────────────────────────────────────────
const updatePayroll = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const payroll = await models.Payroll.findByPk(req.params.id);
        if (!payroll) {
            await t.rollback();
            return commonService.notFound(res, "Payroll not found");
        }

        const {
            pay_date,
            branch_id,
            pay_month,
            pf_number,
            comp_off_days,
            loss_of_pay_days,
            earnings,
            deductions,
        } = req.body;

        // If pay_month changed, re-calculate attendance
        let worked_days = payroll.worked_days;
        let absent_days = payroll.absent_days;
        const targetMonth = pay_month || payroll.pay_month;

        if (pay_month && pay_month !== payroll.pay_month) {
            const employee = await models.Employee.findByPk(payroll.employee_id);
            if (employee) {
                const attendance = await calculateAttendanceForMonth(employee.ref_employee_id, targetMonth);
                worked_days = attendance.worked_days;
                absent_days = attendance.absent_days;
            }
        }

        // Recalculate totals if items provided
        let total_earnings = parseFloat(payroll.total_earnings);
        let total_deductions = parseFloat(payroll.total_deductions);

        if (earnings !== undefined || deductions !== undefined) {
            const newEarnings = earnings ?? [];
            const newDeductions = deductions ?? [];
            total_earnings = newEarnings.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
            total_deductions = newDeductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);

            // Replace all items
            await models.PayrollItem.destroy({
                where: { payroll_id: payroll.id },
                force: true,
                transaction: t,
            });

            const newItems = [
                ...newEarnings.map((e) => ({
                    payroll_id: payroll.id,
                    payroll_master_id: e.payroll_master_id,
                    item_type: "earning",
                    amount: parseFloat(e.amount || 0),
                })),
                ...newDeductions.map((d) => ({
                    payroll_id: payroll.id,
                    payroll_master_id: d.payroll_master_id,
                    item_type: "deduction",
                    amount: parseFloat(d.amount || 0),
                })),
            ];
            if (newItems.length > 0) {
                await models.PayrollItem.bulkCreate(newItems, { transaction: t });
            }
        }

        const net_salary = total_earnings - total_deductions;

        const updated = await payroll.update(
            {
                ...(pay_date !== undefined && { pay_date }),
                ...(branch_id !== undefined && { branch_id }),
                ...(pay_month !== undefined && { pay_month }),
                ...(pf_number !== undefined && { pf_number }),
                ...(comp_off_days !== undefined && { comp_off_days }),
                ...(loss_of_pay_days !== undefined && { loss_of_pay_days }),
                worked_days,
                absent_days,
                total_earnings,
                total_deductions,
                net_salary,
            },
            { transaction: t }
        );

        await t.commit();
        return commonService.okResponse(res, { row: updated });
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE PAYROLL (soft delete header + items)
// ─────────────────────────────────────────────────────────────────────────────
const deletePayroll = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const payroll = await models.Payroll.findByPk(req.params.id);
        if (!payroll) {
            await t.rollback();
            return commonService.notFound(res, "Payroll not found");
        }

        // Soft-delete items first
        await models.PayrollItem.destroy({
            where: { payroll_id: payroll.id },
            transaction: t,
        });

        // Soft-delete header
        await payroll.destroy({ transaction: t });

        await t.commit();
        return commonService.noContentResponse(res);
    } catch (error) {
        await t.rollback();
        return commonService.handleError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ATTENDANCE PREVIEW FOR A GIVEN EMPLOYEE + PAY MONTH
// Useful for the frontend to pre-fill worked_days / absent_days
// ─────────────────────────────────────────────────────────────────────────────
const getPayrollAttendancePreview = async (req, res) => {
    try {
        const { employee_id, pay_month } = req.query;

        if (!employee_id || !pay_month) {
            return commonService.badRequest(res, "employee_id and pay_month are required");
        }
        if (!moment(pay_month, "YYYY-MM", true).isValid()) {
            return commonService.badRequest(res, "pay_month must be in YYYY-MM format");
        }

        const employee = await models.Employee.findByPk(employee_id);
        if (!employee) return commonService.notFound(res, "Employee not found");

        const attendance = await calculateAttendanceForMonth(employee.ref_employee_id, pay_month);

        return commonService.okResponse(res, {
            data: {
                employee_id: parseInt(employee_id),
                employee_no: employee.employee_no,
                employee_name: employee.employee_name,
                pay_month,
                ...attendance,
            },
        });
    } catch (error) {
        return commonService.handleError(res, error);
    }
};

module.exports = {
    createPayroll,
    getPayrolls,
    getPayrollById,
    updatePayroll,
    deletePayroll,
    getPayrollAttendancePreview,
};
