'use strict';

/**
 * Payroll Masters + Items Fix Seeder
 * 
 * 1. Inserts sample payroll_masters (Basic Salary, Incentives as earnings;
 *    Loss of Pay, PF Deduction as deductions) for all existing branches.
 * 2. Inserts payroll_items for every existing payroll record in 2026-02
 *    that currently has no items.
 * 
 * Run:  npx sequelize-cli db:seed --seed 20260224000002-payroll-masters-items-fix.js
 * Undo: npx sequelize-cli db:seed:undo --seed 20260224000002-payroll-masters-items-fix.js
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const now = new Date();

        // ── 1. Get existing branches ─────────────────────────────────────────
        const branches = await queryInterface.sequelize.query(
            `SELECT id FROM branches WHERE deleted_at IS NULL`,
            { type: queryInterface.sequelize.QueryTypes.SELECT }
        );
        if (!branches.length) {
            console.log('⚠️  No branches found. Skipping.');
            return;
        }

        // ── 2. Insert payroll_masters for each branch (skip if already exists) ─
        // payroll_master_type_id: 1 = Earning, 2 = Deduction
        const masterTemplates = [
            { payroll_master_type_id: 1, pay_type_name: 'Basic Salary', calculation_type_id: 1, payroll_value: 0 },
            { payroll_master_type_id: 1, pay_type_name: 'Incentive',    calculation_type_id: 1, payroll_value: 0 },
            { payroll_master_type_id: 2, pay_type_name: 'LOP',          calculation_type_id: 1, payroll_value: 0 },
        ];

        for (const branch of branches) {
            for (const tmpl of masterTemplates) {
                const [existing] = await queryInterface.sequelize.query(
                    `SELECT id FROM payroll_masters
                     WHERE pay_type_name = :name AND branch_id = :bid AND deleted_at IS NULL`,
                    {
                        type: queryInterface.sequelize.QueryTypes.SELECT,
                        replacements: { name: tmpl.pay_type_name, bid: branch.id }
                    }
                );
                if (!existing) {
                    await queryInterface.bulkInsert('payroll_masters', [{
                        ...tmpl,
                        branch_id: branch.id,
                        created_at: now,
                        updated_at: now,
                        deleted_at: null,
                    }], {});
                }
            }
        }
        console.log('✅ Payroll masters seeded.');

        // ── 3. Fetch all payrolls for 2026-02 that have no items ───────────
        const payrolls = await queryInterface.sequelize.query(
            `SELECT p.id, p.branch_id
             FROM payrolls p
             WHERE p.pay_month = '2026-02'
               AND p.deleted_at IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM payroll_items pi WHERE pi.payroll_id = p.id AND pi.deleted_at IS NULL
               )`,
            { type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        if (!payrolls.length) {
            console.log('ℹ️  All payrolls already have items. Nothing to fix.');
            return;
        }

        // ── 4. For each payroll, look up its branch masters and insert items ─
        const allItems = [];
        for (const payroll of payrolls) {
            const masters = await queryInterface.sequelize.query(
                `SELECT id, payroll_master_type_id, payroll_value
                 FROM payroll_masters
                 WHERE branch_id = :bid AND deleted_at IS NULL`,
                {
                    type: queryInterface.sequelize.QueryTypes.SELECT,
                    replacements: { bid: payroll.branch_id }
                }
            );

            for (const master of masters) {
                allItems.push({
                    payroll_id: payroll.id,
                    payroll_master_id: master.id,
                    item_type: master.payroll_master_type_id === 1 ? 'earning' : 'deduction',
                    amount: parseFloat(master.payroll_value || 0),
                    created_at: now,
                    updated_at: now,
                    deleted_at: null,
                });
            }
        }

        if (allItems.length > 0) {
            await queryInterface.bulkInsert('payroll_items', allItems, {});
            console.log(`✅ Inserted ${allItems.length} payroll_items across ${payrolls.length} payrolls.`);
        }

        // ── 5. Recompute totals for affected payrolls ───────────────────────
        for (const payroll of payrolls) {
            await queryInterface.sequelize.query(
                `UPDATE payrolls SET
                    total_earnings   = (SELECT COALESCE(SUM(amount), 0) FROM payroll_items WHERE payroll_id = :id AND item_type = 'earning'   AND deleted_at IS NULL),
                    total_deductions = (SELECT COALESCE(SUM(amount), 0) FROM payroll_items WHERE payroll_id = :id AND item_type = 'deduction' AND deleted_at IS NULL),
                    net_salary       = (SELECT COALESCE(SUM(amount), 0) FROM payroll_items WHERE payroll_id = :id AND item_type = 'earning'   AND deleted_at IS NULL)
                                     - (SELECT COALESCE(SUM(amount), 0) FROM payroll_items WHERE payroll_id = :id AND item_type = 'deduction' AND deleted_at IS NULL)
                 WHERE id = :id`,
                { replacements: { id: payroll.id } }
            );
        }
        console.log('✅ Payroll totals recomputed. Done!');
    },

    down: async (queryInterface, Sequelize) => {
        // Remove items for 2026-02 payrolls
        await queryInterface.sequelize.query(
            `DELETE FROM payroll_items
             WHERE payroll_id IN (SELECT id FROM payrolls WHERE pay_month = '2026-02')`
        );
        // Remove seeded payroll_masters
        await queryInterface.bulkDelete('payroll_masters', {
            pay_type_name: ['Basic Salary', 'Incentive', 'LOP']
        }, {});
        console.log('✅ Rollback complete.');
    }
};
