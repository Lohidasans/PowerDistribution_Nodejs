const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const moment = require("moment");

const MAX_FREE_LEAVE_DAYS = 6;

/**
 * Calculate worked_days, absent_days, and loss_of_pay_days for a given
 * employee and pay_month using employee_tracking and leaves tables.
 *
 * @param {number} refEmployeeId  – employees.ref_employee_id
 * @param {number} employeeId     – employees.id
 * @param {string} payMonth       – "YYYY-MM"
 * @returns {{ worked_days, absent_days, total_days, loss_of_pay_days }}
 */
const calculateAttendanceForMonth = async (refEmployeeId, employeeId, payMonth) => {
    const startDate = moment(payMonth, "YYYY-MM").startOf("month").format("YYYY-MM-DD");
    const endDate = moment(payMonth, "YYYY-MM").endOf("month").format("YYYY-MM-DD");

    const [trackResult] = await sequelize.query(
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

    const workedDays = parseInt(trackResult.worked_days, 10) || 0;
    const totalDays = moment(payMonth, "YYYY-MM").daysInMonth();
    const absentDays = Math.max(0, totalDays - workedDays);

    const [leaveResult] = await sequelize.query(
        `SELECT COUNT(*) AS leave_days
         FROM leaves
         WHERE employee_id = :employeeId
           AND status_id = 3
           AND deleted_at IS NULL
           AND leave_date BETWEEN :startDate AND :endDate`,
        {
            replacements: { employeeId, startDate, endDate },
            type: sequelize.QueryTypes.SELECT,
        }
    );

    const leaveDays = parseInt(leaveResult.leave_days, 10) || 0;
    const lossOfPayDays = Math.max(0, leaveDays - MAX_FREE_LEAVE_DAYS);

    return {
        worked_days: workedDays,
        absent_days: absentDays,
        total_days: totalDays,
        loss_of_pay_days: lossOfPayDays,
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
        const attendance = await calculateAttendanceForMonth(employee.ref_employee_id, employee_id, pay_month);
        const worked_days = attendance.worked_days;
        const absent_days = attendance.absent_days;
        const loss_of_pay_days_calc = attendance.loss_of_pay_days;

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
                loss_of_pay_days: loss_of_pay_days_calc,
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
            employee_status,  // filter by employee status (any value)
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

        // Build employee where clause
        const employeeWhere = {};
        if (employee_status) {
            employeeWhere.status = employee_status;
        }
        
        if (search) {
            employeeWhere[Op.or] = [
                { employee_name: { [Op.iLike]: `%${search}%` } },
                { employee_no: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { count, rows } = await models.Payroll.findAndCountAll({
            where,
            include: [
                {
                    model: models.Employee,
                    as: "employee",
                    attributes: ["id", "employee_name", "employee_no", "profile_image_url", "status"],
                    where: Object.keys(employeeWhere).length > 0 ? employeeWhere : undefined,
                    required: !!search || !!employee_status,
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
                    attributes: ["id", "branch_name", "gst_no", "mobile", "signature_url", "district_id", "state_id","address"],
                    include: [
                        {
                            model: models.District,
                            as: "district",
                            attributes: ["id", "district_name"],
                        },
                        {
                            model: models.State,
                            as: "state",
                            attributes: ["id", "state_name"],
                        },
                    ],
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
            order: [
                [{ model: models.PayrollItem, as: "items" }, "payroll_master_id", "ASC"],
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
                branch: p.branch ? {
                    id: p.branch.id,
                    branch_name: p.branch.branch_name,
                    gst_no: p.branch.gst_no || null,
                    mobile: p.branch.mobile || null,
                    signature_url: p.branch.signature_url || null,
                    address: p.branch.address || null,
                    district_id: p.branch.district_id || null,
                    district: p.branch.district ? {
                        id: p.branch.district.id,
                        district_name: p.branch.district.district_name,
                    } : null,
                    state_id: p.branch.state_id || null,
                    state: p.branch.state ? {
                        id: p.branch.state.id,
                        state_name: p.branch.state.state_name,
                    } : null,
                } : null,
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
                payment_mode: p.payment_mode || null,
                payment_no: p.payment_no || null,
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
        let loss_of_pay_days_recalc = payroll.loss_of_pay_days;
        const targetMonth = pay_month || payroll.pay_month;

        if (pay_month && pay_month !== payroll.pay_month) {
            const employee = await models.Employee.findByPk(payroll.employee_id);
            if (employee) {
                const attendance = await calculateAttendanceForMonth(employee.ref_employee_id, payroll.employee_id, targetMonth);
                worked_days = attendance.worked_days;
                absent_days = attendance.absent_days;
                loss_of_pay_days_recalc = attendance.loss_of_pay_days;
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
                loss_of_pay_days: loss_of_pay_days !== undefined ? loss_of_pay_days : loss_of_pay_days_recalc,
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

        const attendance = await calculateAttendanceForMonth(employee.ref_employee_id, employee_id, pay_month);

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

// ─────────────────────────────────────────────────────────────────────────────
// GET PAYROLL TIMING DETAILS (daily check-in / check-out) FOR A PAY MONTH
// Auto-generates timing for payroll checking.
// GET /api/v1/payrolls/timing?employee_id=&pay_month=YYYY-MM
// ─────────────────────────────────────────────────────────────────────────────
const getPayrollTimingDetails = async (req, res) => {
    try {
        const { employee_id, pay_month } = req.query;

        if (!employee_id || !pay_month) {
            return commonService.badRequest(res, "employee_id and pay_month are required");
        }
        if (!moment(pay_month, "YYYY-MM", true).isValid()) {
            return commonService.badRequest(res, "pay_month must be in YYYY-MM format");
        }

        const employee = await models.Employee.findByPk(employee_id, {
            attributes: ["id", "employee_no", "employee_name", "ref_employee_id"],
        });
        if (!employee) return commonService.notFound(res, "Employee not found");

        const startDate = moment(pay_month, "YYYY-MM").startOf("month").format("YYYY-MM-DD");
        const endDate   = moment(pay_month, "YYYY-MM").endOf("month").format("YYYY-MM-DD");
        const totalDaysInMonth = moment(pay_month, "YYYY-MM").daysInMonth();

        // Fetch all tracking rows for this employee in the pay month, ordered by date + time
        const trackingRows = await sequelize.query(
            `SELECT date, time, status_id
             FROM employee_tracking
             WHERE ref_employee_id = :refEmployeeId
               AND date BETWEEN :startDate AND :endDate
             ORDER BY date ASC, time ASC`,
            {
                replacements: {
                    refEmployeeId: employee.ref_employee_id,
                    startDate,
                    endDate,
                },
                type: sequelize.QueryTypes.SELECT,
            }
        );

        // Build a map of date -> { check_in, check_out, all_punches }
        const dayMap = {};
        for (const row of trackingRows) {
            const d = row.date instanceof Date
                ? moment(row.date).format("YYYY-MM-DD")
                : String(row.date).slice(0, 10);

            if (!dayMap[d]) {
                dayMap[d] = { check_in: null, check_out: null, punches: [] };
            }
            dayMap[d].punches.push({ time: row.time, status_id: parseInt(row.status_id) });
        }

        // For each date, derive first IN and last OUT
        for (const [date, info] of Object.entries(dayMap)) {
            const ins  = info.punches.filter(p => p.status_id === 1).map(p => p.time);
            const outs = info.punches.filter(p => p.status_id === 2).map(p => p.time);

            info.check_in  = ins.length  ? ins[0]            : null;  // first IN
            info.check_out = outs.length ? outs[outs.length - 1] : null; // last OUT

            // Total hours worked (check_in to check_out)
            if (info.check_in && info.check_out) {
                const inMoment  = moment(info.check_in,  "HH:mm:ss");
                const outMoment = moment(info.check_out, "HH:mm:ss");
                const diffMins  = outMoment.diff(inMoment, 'minutes');
                if (diffMins >= 0) {
                    const hrs = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    info.hours_worked = `${hrs}h ${mins}m`;
                    info.hours_worked_decimal = parseFloat((diffMins / 60).toFixed(2));
                } else {
                    info.hours_worked = null;
                    info.hours_worked_decimal = null;
                }
            } else {
                info.hours_worked = null;
                info.hours_worked_decimal = null;
            }

            delete info.punches; // clean up internal array
        }

        // Build complete day-wise list covering every day in the month
        const dailyTimings = [];
        for (let i = 1; i <= totalDaysInMonth; i++) {
            const d = moment(pay_month, "YYYY-MM").date(i).format("YYYY-MM-DD");
            const dayOfWeek = moment(d).format("dddd"); // e.g. "Monday"
            if (dayMap[d]) {
                dailyTimings.push({
                    date: d,
                    day: dayOfWeek,
                    status: "Present",
                    check_in:  dayMap[d].check_in,
                    check_out: dayMap[d].check_out,
                    hours_worked: dayMap[d].hours_worked,
                    hours_worked_decimal: dayMap[d].hours_worked_decimal,
                });
            } else {
                dailyTimings.push({
                    date: d,
                    day: dayOfWeek,
                    status: "Absent",
                    check_in:  null,
                    check_out: null,
                    hours_worked: null,
                    hours_worked_decimal: null,
                });
            }
        }

        // Summary
        const presentDays = dailyTimings.filter(d => d.status === "Present").length;
        const absentDays  = totalDaysInMonth - presentDays;
        const totalHoursDecimal = dailyTimings.reduce((s, d) => s + (d.hours_worked_decimal || 0), 0);

        return commonService.okResponse(res, {
            data: {
                employee_id:   parseInt(employee_id),
                employee_no:   employee.employee_no,
                employee_name: employee.employee_name,
                pay_month,
                total_days:    totalDaysInMonth,
                present_days:  presentDays,
                absent_days:   absentDays,
                total_hours_worked: parseFloat(totalHoursDecimal.toFixed(2)),
                daily_timings: dailyTimings,
            },
        });
    } catch (error) {
        return commonService.handleError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE PAYROLL DETAIL FOR A PARTICULAR EMPLOYEE (Payslip view)
// GET /api/v1/employees/:employee_id/payrolls/:payroll_id
// ─────────────────────────────────────────────────────────────────────────────
const getEmployeePayrollById = async (req, res) => {
    try {
        const { employee_id, payroll_id } = req.params;

        const payroll = await models.Payroll.findOne({
            where: { id: payroll_id, employee_id },
            include: [
                {
                    model: models.Employee,
                    as: "employee",
                    attributes: ["id", "employee_name", "employee_no", "profile_image_url"],
                },
                {
                    model: models.Branch,
                    as: "branch",
                    attributes: ["id", "branch_name", "gst_no", "mobile", "signature_url", "district_id", "state_id", "address"],
                    include: [
                        {
                            model: models.District,
                            as: "district",
                            attributes: ["id", "district_name"],
                        },
                        {
                            model: models.State,
                            as: "state",
                            attributes: ["id", "state_name"],
                        },
                    ],
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
            order: [
                [{ model: models.PayrollItem, as: "items" }, "payroll_master_id", "ASC"],
            ],
            paranoid: true,
        });

        if (!payroll) return commonService.notFound(res, "Payroll not found");

        const p = payroll.toJSON();

        // Generate receipt_no from id + fiscal year
        const [yr, mm] = p.pay_month.split("-").map(Number);
        const fyStart = mm >= 4 ? yr : yr - 1;
        const fyEnd = fyStart + 1;
        const fyShort = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
        const receipt_no = `REC ${String(p.id).padStart(2, "0")}/${fyShort}`;
        const month_label = moment(p.pay_month, "YYYY-MM").format("MMMM YYYY");

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

        // Fetch approved leave count for the pay month
        const startDate = moment(p.pay_month, "YYYY-MM").startOf("month").format("YYYY-MM-DD");
        const endDate   = moment(p.pay_month, "YYYY-MM").endOf("month").format("YYYY-MM-DD");

        const [leaveResult] = await sequelize.query(
            `SELECT COUNT(*) AS leave_days
             FROM leaves
             WHERE employee_id = :employee_id
               AND status_id = 3
               AND deleted_at IS NULL
               AND leave_date BETWEEN :startDate AND :endDate`,
            {
                replacements: { employee_id, startDate, endDate },
                type: sequelize.QueryTypes.SELECT,
            }
        );
        const total_leave_days = parseInt(leaveResult.leave_days, 10) || 0;

        // Fetch overtime hours for the pay month from employee_tracking
        const employee = await models.Employee.findByPk(employee_id, { attributes: ["ref_employee_id"] });
        const OFFICE_END = "20:30:00";
        const [overtimeResult] = await sequelize.query(
            `SELECT COALESCE(SUM(
                CASE
                    WHEN MAX(et.time) > :office_end::time THEN
                        EXTRACT(EPOCH FROM (MAX(et.time) - :office_end::time)) / 3600
                    ELSE 0
                END
             ), 0) AS overtime_hours
             FROM employee_tracking et
             WHERE et.ref_employee_id = :ref_employee_id
               AND et.date BETWEEN :startDate AND :endDate
               AND et.status_id = 1
             GROUP BY et.date`,
            {
                replacements: {
                    ref_employee_id: employee ? employee.ref_employee_id : 0,
                    startDate,
                    endDate,
                    office_end: OFFICE_END,
                },
                type: sequelize.QueryTypes.SELECT,
            }
        );
        const overtimeHoursTotal = overtimeResult
            ? parseFloat(overtimeResult.overtime_hours || 0)
            : 0;
        const overtimeHrs = Math.floor(overtimeHoursTotal);
        const overtimeMins = Math.round((overtimeHoursTotal - overtimeHrs) * 60);
        const overtime_label = overtimeMins > 0
            ? `${overtimeHrs}h ${overtimeMins}m`
            : `${overtimeHrs} Hrs`;

        return commonService.okResponse(res, {
            data: {
                payroll_id: p.id,
                receipt_no,
                month_label,
                pay_date: moment(p.pay_date).format("DD/MM/YYYY"),
                branch: p.branch ? {
                    id: p.branch.id,
                    branch_name: p.branch.branch_name,
                    address: p.branch.address || null,
                    mobile: p.branch.mobile || null,
                    gst_no: p.branch.gst_no || null,
                    signature_url: p.branch.signature_url || null,
                    district: p.branch.district?.district_name || null,
                    state: p.branch.state?.state_name || null,
                } : null,
                employee: {
                    employee_id: p.employee_id,
                    employee_name: p.employee?.employee_name || null,
                    employee_no: p.employee_no,
                    profile_image_url: p.employee?.profile_image_url || null,
                    pf_number: p.pf_number,
                },
                pay_month: p.pay_month,
                total_days_worked: p.worked_days,
                absent_days: p.absent_days,
                comp_off_days: p.comp_off_days,
                loss_of_pay_days: p.loss_of_pay_days,
                total_leave: total_leave_days,
                overtime: overtime_label,
                earnings,
                deductions,
                total_earnings,
                total_deductions,
                net_salary: parseFloat(p.net_salary || 0),
            },
        });
    } catch (error) {
        return commonService.handleError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PAYROLL LIST FOR A PARTICULAR EMPLOYEE
// GET /api/v1/employees/:employee_id/payrolls
// ─────────────────────────────────────────────────────────────────────────────
const getEmployeePayrolls = async (req, res) => {
    try {
        const { employee_id } = req.params;
        const {
            page = 1,
            pageSize = 10,
            search,           // search by month name, receipt_no
            pay_month,        // exact e.g. "2026-02"
            year,             // e.g. "2026"
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        const where = { employee_id };

        if (pay_month) {
            where.pay_month = pay_month;
        } else if (year) {
            where.pay_month = { [Op.like]: `${year}-%` };
        }

        const employee = await models.Employee.findByPk(employee_id, {
            attributes: ["id", "employee_name", "employee_no", "profile_image_url"],
        });
        if (!employee) return commonService.notFound(res, "Employee not found");

        const { count, rows } = await models.Payroll.findAndCountAll({
            where,
            attributes: ["id", "pay_date", "pay_month", "net_salary", "created_at"],
            order: [["pay_month", "DESC"], ["id", "DESC"]],
            paranoid: true,
        });

        // Build list with generated receipt_no and formatted month
        let list = rows.map((p, index) => {
            // Fiscal year short string e.g. pay_month "2025-10" → "25-26"
            const [yr, mm] = p.pay_month.split("-").map(Number);
            const fyStart = mm >= 4 ? yr : yr - 1;
            const fyEnd = fyStart + 1;
            const fyShort = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;

            const receipt_no = `REC ${String(p.id).padStart(2, "0")}/${fyShort}`;
            const month_label = moment(p.pay_month, "YYYY-MM").format("MMMM YYYY");
            const pay_date_fmt = moment(p.pay_date).format("DD/MM/YYYY");

            return {
                payroll_id: p.id,
                month: month_label,
                receipt_no,
                pay_date: pay_date_fmt,
                amount_credited: parseFloat(p.net_salary || 0),
            };
        });

        // Search filter (client-side after formatting)
        if (search) {
            const s = search.toLowerCase();
            list = list.filter(
                (r) =>
                    r.month.toLowerCase().includes(s) ||
                    r.receipt_no.toLowerCase().includes(s) ||
                    r.pay_date.includes(s)
            );
        }

        const totalRecords = search ? list.length : count;
        const totalPages = Math.ceil(totalRecords / parseInt(pageSize));

        // Paginate after search filter
        const paginated = search
            ? list.slice(offset, offset + parseInt(pageSize))
            : list;

        return commonService.okResponse(res, {
            employee: {
                employee_id: employee.id,
                employee_name: employee.employee_name,
                employee_no: employee.employee_no,
                profile_image_url: employee.profile_image_url,
            },
            pagination: {
                total: totalRecords,
                page: parseInt(page),
                pageSize: parseInt(pageSize),
                totalPages,
            },
            data: paginated,
        });
    } catch (error) {
        return commonService.handleError(res, error);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PAYROLL PAYMENT (called when payment receipt is created)
// PATCH /api/v1/payrolls/:id/payment
// Body: { payment_mode: "Cash|Bank Transfer|...", payment_no: "TXN123..." }
// ─────────────────────────────────────────────────────────────────────────────
const updatePayrollPayment = async (req, res) => {
    try {
        const payroll = await models.Payroll.findByPk(req.params.id);
        if (!payroll) return commonService.notFound(res, "Payroll not found");

        const { payment_mode, payment_no } = req.body;

        if (!payment_mode && !payment_no) {
            return commonService.badRequest(res, "At least payment_mode or payment_no is required");
        }

        await payroll.update({
            ...(payment_mode !== undefined && { payment_mode }),
            ...(payment_no !== undefined && { payment_no }),
        });

        return commonService.okResponse(res, {
            message: "Payment details updated successfully",
            data: {
                id: payroll.id,
                payment_mode: payroll.payment_mode,
                payment_no: payroll.payment_no,
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
    updatePayrollPayment,
    deletePayroll,
    getPayrollAttendancePreview,
    getPayrollTimingDetails,
    getEmployeePayrolls,
    getEmployeePayrollById,
};
