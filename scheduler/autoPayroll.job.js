const { models, sequelize } = require('../models');
const moment = require('moment');
const { getIncentiveAmountForEmployee } = require('../services/employeeIncentiveService');

/**
 * Auto-generate payroll for ALL active employees for the PREVIOUS calendar month.
 * 
 * Logic:
 *  1. Get all active employees with their payroll masters (branch-level).
 *  2. For each employee, count worked_days from employee_tracking via ref_employee_id.
 *  3. Skip if a payroll record already exists for that employee + pay_month.
 *  4. Create payroll header + payroll_items in a single transaction per employee.
 * 
 * Cron schedule: Runs on the 1st of every month at 00:30 AM.
 */
const autoGenerateMonthlyPayroll = async (overridePayMonth = null) => {
    // IMPORTANT: The cron fires at 00:30 IST on the 1st = 19:00 UTC on the last day of previous month.
    // The VPS runs UTC, so moment() would see "Feb 28" and subtract(1,'month') would give January.
    // We must work in IST (UTC+5:30) to correctly get "March 1" and compute payMonth = February.
    const nowIST = moment().utcOffset('+05:30');
    const payMonth = overridePayMonth || nowIST.clone().subtract(1, 'month').format('YYYY-MM');
    const startDate = moment(payMonth, 'YYYY-MM').startOf('month').format('YYYY-MM-DD');
    const endDate = moment(payMonth, 'YYYY-MM').endOf('month').format('YYYY-MM-DD');
    const totalDaysInMonth = moment(payMonth, 'YYYY-MM').daysInMonth();
    const payDate = nowIST.format('YYYY-MM-DD'); // IST date as pay date

    console.log(`🚀 Auto-payroll job started | pay_month: ${payMonth}`);

    // Fetch all active employees
    const employees = await models.Employee.findAll({
        where: { status: 'Active', deleted_at: null },
        attributes: ['id', 'employee_no', 'employee_name', 'branch_id', 'ref_employee_id', 'salary'],
        raw: true,
    });

    if (!employees.length) {
        console.log('⚠️  No active employees found. Skipping auto-payroll.');
        return;
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const employee of employees) {
        const t = await sequelize.transaction();
        try {
            // Skip if already generated
            const existing = await models.Payroll.findOne({
                where: { employee_id: employee.id, pay_month: payMonth },
                transaction: t,
            });
            if (existing) {
                await t.rollback();
                skipped++;
                continue;
            }

            // ── worked_days from employee_tracking ────────────────────────────
            const [trackResult] = await sequelize.query(
                `SELECT COUNT(DISTINCT date)::int AS worked_days
                 FROM employee_tracking
                 WHERE ref_employee_id = :refEmployeeId
                   AND date BETWEEN :startDate AND :endDate
                   AND status_id = 1`,
                {
                    replacements: {
                        refEmployeeId: employee.ref_employee_id,
                        startDate,
                        endDate,
                    },
                    type: sequelize.QueryTypes.SELECT,
                    transaction: t,
                }
            );
            const workedDays = parseInt(trackResult.worked_days, 10) || 0;
            const absentDays = Math.max(0, totalDaysInMonth - workedDays);

            // ── loss_of_pay_days from approved leaves ─────────────────────────
            const MAX_FREE_LEAVE_DAYS = 6;
            const [leaveResult] = await sequelize.query(
                `SELECT COUNT(*) AS leave_days
                 FROM leaves
                 WHERE employee_id = :employeeId
                   AND status_id = 3
                   AND deleted_at IS NULL
                   AND leave_date BETWEEN :startDate AND :endDate`,
                {
                    replacements: { employeeId: employee.id, startDate, endDate },
                    type: sequelize.QueryTypes.SELECT,
                    transaction: t,
                }
            );
            const leaveDays = parseInt(leaveResult.leave_days, 10) || 0;
            const lossOfPayDays = Math.max(0, leaveDays - MAX_FREE_LEAVE_DAYS);

            // ── Fetch earnings/deductions from payroll_masters for this branch ─
            // Query fresh for each employee's branch_id to avoid any caching issues
            const payrollMasters = await models.PayrollMaster.findAll({
                where: { branch_id: employee.branch_id, deleted_at: null },
                attributes: ['id', 'payroll_master_type_id', 'pay_type_name', 'payroll_value'],
                paranoid: true,
            });

            if (!payrollMasters.length) {
                console.warn(`  ⚠️  No payroll_masters found for branch_id=${employee.branch_id}. Skipping employee ${employee.employee_no}.`);
                await t.rollback();
                skipped++;
                continue;
            }

            // Use parseInt to safely compare — Sequelize may return type_id as string in some drivers
            const earningMasters = payrollMasters.filter(pm => parseInt(pm.payroll_master_type_id, 10) === 1);
            const deductionMasters = payrollMasters.filter(pm => parseInt(pm.payroll_master_type_id, 10) === 2);

            const incentiveAmount = await getIncentiveAmountForEmployee(employee.id, payMonth);

            const LOP_NAMES = ['lop'];
            const INCENTIVE_NAMES = ['incentive', 'incentives'];
            const BASIC_SALARY_NAMES = ['basic salary', 'basic'];
            const empSalary = parseFloat(employee.salary || 0);

            const dailyRate = totalDaysInMonth > 0 ? empSalary / totalDaysInMonth : 0;
            const lopAmount = parseFloat((lossOfPayDays * dailyRate).toFixed(2));

            const total_earnings = earningMasters.reduce((s, pm) => {
                const name = (pm.pay_type_name || '').toLowerCase().trim();
                const isIncentiveItem = INCENTIVE_NAMES.includes(name);
                const isBasicSalaryItem = BASIC_SALARY_NAMES.includes(name);
                if (isIncentiveItem) return s + incentiveAmount;
                if (isBasicSalaryItem) return s + empSalary;
                return s + parseFloat(pm.payroll_value);
            }, 0);
            const total_deductions = deductionMasters.reduce((s, pm) => {
                const name = (pm.pay_type_name || '').toLowerCase().trim();
                return s + (LOP_NAMES.includes(name) ? lopAmount : parseFloat(pm.payroll_value));
            }, 0);
            const net_salary = total_earnings - total_deductions;

            // ── Create payroll header ─────────────────────────────────────────
            const payroll = await models.Payroll.create(
                {
                    pay_date: payDate,
                    branch_id: employee.branch_id,
                    employee_id: employee.id,
                    employee_no: employee.employee_no,
                    pay_month: payMonth,
                    pf_number: null,
                    worked_days: workedDays,
                    absent_days: absentDays,
                    comp_off_days: 0,
                    loss_of_pay_days: lossOfPayDays,
                    total_earnings,
                    total_deductions,
                    net_salary,
                },
                { transaction: t }
            );

            // ── Create payroll_items ─────────────────────────────────────────

            const items = [
                ...earningMasters.map(pm => {
                    const name = (pm.pay_type_name || '').toLowerCase().trim();
                    const isIncentiveItem = INCENTIVE_NAMES.includes(name);
                    const isBasicSalaryItem = BASIC_SALARY_NAMES.includes(name);
                    let amount;
                    if (isIncentiveItem) amount = incentiveAmount;
                    else if (isBasicSalaryItem) amount = empSalary;
                    else amount = parseFloat(pm.payroll_value);
                    return {
                        payroll_id: payroll.id,
                        payroll_master_id: pm.id,
                        item_type: 'earning',
                        amount,
                    };
                }),
                ...deductionMasters.map(pm => {
                    const name = (pm.pay_type_name || '').toLowerCase().trim();
                    return {
                        payroll_id: payroll.id,
                        payroll_master_id: pm.id,
                        item_type: 'deduction',
                        amount: LOP_NAMES.includes(name) ? lopAmount : parseFloat(pm.payroll_value),
                    };
                }),
            ];

            if (items.length > 0) {
                await models.PayrollItem.bulkCreate(items, { transaction: t });
            }

            await t.commit();
            created++;
            console.log(`  ✅ Payroll created | Employee: ${employee.employee_no} | Worked: ${workedDays}d | Net: ${net_salary}`);

        } catch (err) {
            await t.rollback();
            failed++;
            console.error(`  ❌ Failed for employee ${employee.employee_no}:`, err.message);
        }
    }

    console.log(`\n📊 Auto-payroll summary for ${payMonth}:`);
    console.log(`   Created : ${created}`);
    console.log(`   Skipped : ${skipped} (already existed)`);
    console.log(`   Failed  : ${failed}`);
    console.log(`✅ Auto-payroll job finished at ${new Date()}`);
};

module.exports = autoGenerateMonthlyPayroll;
