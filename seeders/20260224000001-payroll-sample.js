'use strict';

/**
 * Payroll Test Seeder
 * 
 * Creates sample payroll records for 10 employees (matching the Payroll List screenshot).
 * Uses ref_employee_ids 1200–1209 (same as employee_tracking seeder).
 * pay_month: "2026-02" (February 2026)
 * 
 * Run:  npx sequelize-cli db:seed --seed 20260224000001-payroll-sample.js
 * Undo: npx sequelize-cli db:seed:undo --seed 20260224000001-payroll-sample.js
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const now = new Date();

        // ── Step 1: Fetch actual employee IDs + employee_no from DB ─────────
        const employees = await queryInterface.sequelize.query(
            `SELECT id, employee_no, branch_id, ref_employee_id
             FROM employees
             WHERE deleted_at IS NULL AND status = 'Active'
             ORDER BY id ASC
             LIMIT 10`,
            { type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        if (!employees.length) {
            console.log('⚠️  No active employees found. Seeder skipped.');
            return;
        }

        // ── Step 2: Fetch payroll_masters for each branch ───────────────────
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

        // ── Step 3: Count worked_days per employee for pay_month 2026-02 ────
        const payMonth = '2026-02';
        const startDate = '2026-02-01';
        const endDate = '2026-02-28';
        const totalDaysInMonth = 28;
        const payDate = '2026-02-25';

        const payrollIds = [];

        for (const emp of employees) {
            // Check if payroll already exists for this employee + month
            const [existing] = await queryInterface.sequelize.query(
                `SELECT id FROM payrolls WHERE employee_id = :eid AND pay_month = :pm AND deleted_at IS NULL`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { eid: emp.id, pm: payMonth }
                }
            );
            if (existing) {
                console.log(`  ⚠️  Payroll already exists for employee ${emp.employee_no}. Skipping.`);
                continue;
            }

            // Worked days from employee_tracking
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

            // Get payroll_masters for this employee's branch
            const branchMasters = payrollMasters.filter(pm => pm.branch_id === emp.branch_id);
            // type 1 = earnings, type 2 = deductions
            const earningMasters = branchMasters.filter(pm => pm.payroll_master_type_id === 1);
            const deductionMasters = branchMasters.filter(pm => pm.payroll_master_type_id === 2);

            // Fallback: if no payroll masters configured, use fixed demo values
            let total_earnings = earningMasters.reduce((s, pm) => s + parseFloat(pm.payroll_value || 0), 0);
            let total_deductions = deductionMasters.reduce((s, pm) => s + parseFloat(pm.payroll_value || 0), 0);

            if (total_earnings === 0) total_earnings = 20000;   // fallback basic salary
            if (total_deductions === 0) total_deductions = 100; // fallback small deduction

            const net_salary = total_earnings - total_deductions;

            // Insert payroll header
            await queryInterface.bulkInsert('payrolls', [{
                pay_date: payDate,
                branch_id: emp.branch_id,
                employee_id: emp.id,
                employee_no: emp.employee_no,
                pay_month: payMonth,
                pf_number: null,
                worked_days: workedDays > 0 ? workedDays : 30, // fallback if no tracking
                absent_days: workedDays > 0 ? absentDays : 1,
                comp_off_days: 1,
                loss_of_pay_days: 1,
                total_earnings,
                total_deductions,
                net_salary,
                created_at: now,
                updated_at: now,
                deleted_at: null,
            }], {});

            // Get inserted payroll id
            const [inserted] = await queryInterface.sequelize.query(
                `SELECT id FROM payrolls WHERE employee_id = :eid AND pay_month = :pm ORDER BY id DESC LIMIT 1`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { eid: emp.id, pm: payMonth }
                }
            );
            payrollIds.push({ payrollId: inserted.id, emp, earningMasters, deductionMasters });
        }

        // ── Step 4: Insert payroll_items ────────────────────────────────────
        const allItems = [];
        for (const { payrollId, earningMasters, deductionMasters } of payrollIds) {
            // Earnings
            if (earningMasters.length > 0) {
                earningMasters.forEach(pm => {
                    allItems.push({
                        payroll_id: payrollId,
                        payroll_master_id: pm.id,
                        item_type: 'earning',
                        amount: parseFloat(pm.payroll_value || 0),
                        created_at: now,
                        updated_at: now,
                        deleted_at: null,
                    });
                });
            } else {
                // Fallback: single "Basic Salary" earning - get any earning master
                const anyEarning = payrollMasters.find(pm => pm.payroll_master_type_id === 1);
                if (anyEarning) {
                    allItems.push({
                        payroll_id: payrollId,
                        payroll_master_id: anyEarning.id,
                        item_type: 'earning',
                        amount: 20000,
                        created_at: now,
                        updated_at: now,
                        deleted_at: null,
                    });
                }
            }

            // Deductions
            if (deductionMasters.length > 0) {
                deductionMasters.forEach(pm => {
                    allItems.push({
                        payroll_id: payrollId,
                        payroll_master_id: pm.id,
                        item_type: 'deduction',
                        amount: parseFloat(pm.payroll_value || 0),
                        created_at: now,
                        updated_at: now,
                        deleted_at: null,
                    });
                });
            } else {
                // Fallback: single "Loss of Pay" deduction - get any deduction master
                const anyDeduction = payrollMasters.find(pm => pm.payroll_master_type_id === 2);
                if (anyDeduction) {
                    allItems.push({
                        payroll_id: payrollId,
                        payroll_master_id: anyDeduction.id,
                        item_type: 'deduction',
                        amount: 100,
                        created_at: now,
                        updated_at: now,
                        deleted_at: null,
                    });
                }
            }
        }

        if (allItems.length > 0) {
            await queryInterface.bulkInsert('payroll_items', allItems, {});
        }

        console.log(`✅ Payroll seeder complete. Created ${payrollIds.length} payrolls for ${payMonth}.`);
    },

    down: async (queryInterface, Sequelize) => {
        // Remove payroll_items for the test month first, then payrolls
        await queryInterface.sequelize.query(
            `DELETE FROM payroll_items
             WHERE payroll_id IN (
                 SELECT id FROM payrolls WHERE pay_month = '2026-02'
             )`
        );
        await queryInterface.bulkDelete('payrolls', { pay_month: '2026-02' }, {});
        console.log('✅ Payroll seeder rolled back.');
    }
};
