'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const now = new Date();

        const employees = await queryInterface.sequelize.query(
            `SELECT id, employee_no, branch_id, ref_employee_id, department_id, role_id, salary
             FROM employees
             WHERE deleted_at IS NULL AND status = 'Active'
             ORDER BY id ASC
             LIMIT 10`,
            { type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        if (!employees.length) {
            console.log('No active employees found. Seeder skipped.');
            return;
        }

        const branchIds = [...new Set(employees.map(e => e.branch_id))];
        const payrollMasters = await queryInterface.sequelize.query(
            `SELECT id, payroll_master_type_id, pay_type_name, payroll_value, branch_id
             FROM payroll_masters
             WHERE deleted_at IS NULL
               AND branch_id IN (:branchIds)`,
            {
                type: queryInterface.sequelize.QueryTypes.SELECT,
                replacements: { branchIds }
            }
        );

        const payMonth = '2026-02';
        const startDate = '2026-02-01';
        const endDate = '2026-02-28';
        const totalDaysInMonth = 28;
        const payDate = '2026-02-25';
        const month = 2;
        const year = 2026;
        const INCENTIVE_NAMES = ['incentive', 'incentives'];
        const BASIC_SALARY_NAMES = ['basic salary', 'basic'];

        const payrollIds = [];

        for (const emp of employees) {
            const [existing] = await queryInterface.sequelize.query(
                `SELECT id FROM payrolls WHERE employee_id = :eid AND pay_month = :pm AND deleted_at IS NULL`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { eid: emp.id, pm: payMonth }
                }
            );
            if (existing) {
                console.log(`Payroll already exists for employee ${emp.employee_no}. Skipping.`);
                continue;
            }

            const branchMasters = payrollMasters.filter(pm => pm.branch_id === emp.branch_id);
            const earningMasters = branchMasters.filter(pm => parseInt(pm.payroll_master_type_id, 10) === 1);
            const deductionMasters = branchMasters.filter(pm => parseInt(pm.payroll_master_type_id, 10) === 2);

            if (!branchMasters.length) {
                console.log(`No payroll_masters for branch_id=${emp.branch_id}. Skipping employee ${emp.employee_no}.`);
                continue;
            }

            const [trackResult] = await queryInterface.sequelize.query(
                `SELECT COUNT(DISTINCT date)::int AS worked_days
                 FROM employee_tracking
                 WHERE ref_employee_id = :refId
                   AND date BETWEEN :s AND :e
                   AND status_id = 1`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { refId: emp.ref_employee_id, s: startDate, e: endDate }
                }
            );
            const workedDays = parseInt(trackResult?.worked_days || 0, 10);
            const absentDays = Math.max(0, totalDaysInMonth - workedDays);

            const MAX_FREE_LEAVE_DAYS = 6;
            const [leaveResult] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) AS leave_days
                 FROM leaves
                 WHERE employee_id = :employeeId
                   AND status_id = 3
                   AND deleted_at IS NULL
                   AND leave_date BETWEEN :s AND :e`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { employeeId: emp.id, s: startDate, e: endDate }
                }
            );
            const leaveDays = parseInt(leaveResult?.leave_days || 0, 10);
            const lossOfPayDays = Math.max(0, leaveDays - MAX_FREE_LEAVE_DAYS);
            const empSalary = parseFloat(emp.salary || 0);
            const dailyRate = totalDaysInMonth > 0 ? empSalary / totalDaysInMonth : 0;
            const lopAmount = parseFloat((lossOfPayDays * dailyRate).toFixed(2));

            const [incentiveRow] = await queryInterface.sequelize.query(
                `WITH emp_sales AS (
                    SELECT
                        e.id            AS employee_id,
                        e.department_id,
                        e.role_id,
                        COALESCE(SUM(sib.net_total), 0)::numeric AS sales_amount
                    FROM employees e
                    LEFT JOIN sales_invoice_bills sib
                        ON sib.employee_id = e.id
                        AND sib.deleted_at IS NULL
                        AND sib.is_active = true
                        AND sib.status = 'Invoice'
                        AND EXTRACT(MONTH FROM sib.invoice_date) = :month
                        AND EXTRACT(YEAR  FROM sib.invoice_date) = :year
                    WHERE e.id = :employeeId
                        AND e.deleted_at IS NULL
                    GROUP BY e.id, e.department_id, e.role_id
                )
                SELECT
                    CASE
                        WHEN ei.incentive_type = 'Percentage'
                            THEN ROUND((es.sales_amount * ei.incentive_value / 100), 2)
                        WHEN ei.incentive_type = 'Rupees'
                            THEN ei.incentive_value::numeric
                        ELSE 0
                    END AS incentives_amount
                FROM emp_sales es
                LEFT JOIN employee_incentives ei
                    ON ei.department_id = es.department_id
                    AND ei.role_id      = es.role_id
                    AND ei.deleted_at IS NULL
                    AND es.sales_amount >= ei.sales_target[1]
                    AND es.sales_amount <= ei.sales_target[2]
                LIMIT 1`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { employeeId: emp.id, month, year }
                }
            );
            const incentiveAmount = parseFloat(incentiveRow?.incentives_amount || 0);

            const total_earnings = earningMasters.reduce((s, pm) => {
                const name = (pm.pay_type_name || '').toLowerCase().trim();
                const isIncentiveItem = INCENTIVE_NAMES.includes(name);
                const isBasicSalaryItem = BASIC_SALARY_NAMES.includes(name);
                if (isIncentiveItem) return s + incentiveAmount;
                if (isBasicSalaryItem) return s + parseFloat(emp.salary || 0);
                return s + parseFloat(pm.payroll_value);
            }, 0);
            const total_deductions = deductionMasters.reduce((s, pm) => {
                const name = (pm.pay_type_name || '').toLowerCase().trim();
                return s + (name === 'lop' ? lopAmount : parseFloat(pm.payroll_value));
            }, 0);
            const net_salary = total_earnings - total_deductions;

            await queryInterface.bulkInsert('payrolls', [{
                pay_date: payDate,
                branch_id: emp.branch_id,
                employee_id: emp.id,
                employee_no: emp.employee_no,
                pay_month: payMonth,
                pf_number: null,
                worked_days: workedDays,
                absent_days: absentDays,
                comp_off_days: 0,
                loss_of_pay_days: lossOfPayDays,
                total_earnings,
                total_deductions,
                net_salary,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            }], {});

            const [inserted] = await queryInterface.sequelize.query(
                `SELECT id FROM payrolls WHERE employee_id = :eid AND pay_month = :pm ORDER BY id DESC LIMIT 1`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { eid: emp.id, pm: payMonth }
                }
            );
            payrollIds.push({ payrollId: inserted.id, earningMasters, deductionMasters, incentiveAmount, empSalary: parseFloat(emp.salary || 0), lopAmount });
        }

        const allItems = [];
        for (const { payrollId, earningMasters, deductionMasters, incentiveAmount, empSalary, lopAmount } of payrollIds) {
            earningMasters.forEach(pm => {
                const name = (pm.pay_type_name || '').toLowerCase().trim();
                const isIncentiveItem = INCENTIVE_NAMES.includes(name);
                const isBasicSalaryItem = BASIC_SALARY_NAMES.includes(name);
                let amount;
                if (isIncentiveItem) amount = incentiveAmount;
                else if (isBasicSalaryItem) amount = empSalary;
                else amount = parseFloat(pm.payroll_value);
                allItems.push({
                    payroll_id: payrollId,
                    payroll_master_id: pm.id,
                    item_type: 'earning',
                    amount,
                    created_at: now,
                    updated_at: now,
                    deleted_at: null,
                });
            });

            deductionMasters.forEach(pm => {
                const name = (pm.pay_type_name || '').toLowerCase().trim();
                allItems.push({
                    payroll_id: payrollId,
                    payroll_master_id: pm.id,
                    item_type: 'deduction',
                    amount: name === 'lop' ? lopAmount : parseFloat(pm.payroll_value),
                    created_at: now,
                    updated_at: now,
                    deleted_at: null,
                });
            });
        }

        if (allItems.length > 0) {
            await queryInterface.bulkInsert('payroll_items', allItems, {});
        }

        console.log(`Payroll seeder complete. Created ${payrollIds.length} payrolls for ${payMonth}.`);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.sequelize.query(
            `DELETE FROM payroll_items
             WHERE payroll_id IN (
                 SELECT id FROM payrolls WHERE pay_month = '2026-02'
             )`
        );
        await queryInterface.bulkDelete('payrolls', { pay_month: '2026-02' }, {});
        console.log('Payroll seeder rolled back.');
    }
};
