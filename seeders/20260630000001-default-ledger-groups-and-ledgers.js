'use strict';

/**
 * Seeds the default Ledger Groups and Ledger Accounts (ledgers) that were
 * still missing from the chart of accounts.
 *
 * Schema hierarchy:
 *   ledger_accounts  -> Nature (Asset / Expense / Income / Liability)   [already seeded]
 *     ledger_group   -> e.g. Fixed Assets, Salary, ...   (FK ledger_account_id)
 *       ledger       -> e.g. Bank - UPI, GRN, ...         (FK ledger_group_id)
 *
 * In the doc:  "Ledger Group"  -> ledger_group table
 *              "Ledger Account" -> ledger table  (its normal balance is inherited
 *                                  from the parent group's nature)
 *
 * Written defensively: parent IDs are resolved BY NAME at run time (the existing
 * seeders hardcode auto-increment IDs that no longer line up), and anything that
 * already exists is skipped. Safe to run on a partially seeded database.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();

    const select = (sql) =>
      sequelize.query(sql, { type: Sequelize.QueryTypes.SELECT });

    // Returns a generator that yields the next `${prefix}NNN` code, continuing
    // from the highest numeric suffix already present.
    const makeNextNo = (values, prefix) => {
      let max = 0;
      values.forEach((v) => {
        const m = String(v || '').match(/(\d+)\s*$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      let n = max;
      return () => `${prefix}${String(++n).padStart(3, '0')}`;
    };

    /* ============================================================
       1. Nature (ledger_accounts): name -> id
       ============================================================ */
    const natures = await select(`SELECT id, account_name FROM ledger_accounts`);
    const natureId = {};
    natures.forEach((r) => (natureId[r.account_name.toLowerCase()] = r.id));

    /* ============================================================
       2. Missing Ledger Groups
       ============================================================ */
    const MISSING_GROUPS = [
      { name: 'Salary', nature: 'Expense' },
      { name: 'Employee Claims', nature: 'Liability' },
      { name: 'Customer Advances', nature: 'Liability' },
      { name: 'Gold Scheme Liability', nature: 'Liability' },
    ];

    const existingGroups = await select(
      `SELECT ledger_group_no, ledger_group_name FROM ledger_group`
    );
    const groupNameExists = new Set(
      existingGroups.map((g) => g.ledger_group_name.toLowerCase())
    );
    const nextGroupNo = makeNextNo(
      existingGroups.map((g) => g.ledger_group_no),
      'LGID'
    );

    const groupRows = MISSING_GROUPS
      .filter((g) => !groupNameExists.has(g.name.toLowerCase()))
      .map((g) => ({
        ledger_group_no: nextGroupNo(),
        ledger_group_name: g.name,
        ledger_account_id: natureId[g.nature.toLowerCase()] ?? null,
        branch_id: 1,
        status_id: 1,
        created_at: now,
        updated_at: now,
      }));

    if (groupRows.length) {
      await queryInterface.bulkInsert('ledger_group', groupRows, {});
    }

    /* ============================================================
       3. Missing Ledgers (doc "Ledger Accounts")
       ============================================================ */
    // Re-read groups so the just-inserted ones are included.
    const allGroups = await select(
      `SELECT id, ledger_group_name FROM ledger_group`
    );
    const groupId = {};
    allGroups.forEach((g) => (groupId[g.ledger_group_name.toLowerCase()] = g.id));

    const LEDGERS = [
      { name: 'Bank - UPI', group: 'Bank Accounts' },
      { name: 'Bank - Card', group: 'Bank Accounts' },
      { name: 'Cash Account', group: 'Cash In Hand' },
      { name: 'Customer List', group: 'Sundry Debtors' },
      { name: 'Vendor List', group: 'Sundry Creditors' },
      { name: 'GRN', group: 'Purchase Accounts' },
      { name: 'Old Gold Purchase', group: 'Purchase Accounts' },
      { name: 'Sales', group: 'Sales Accounts' },
      { name: 'Output GST - Sales related GST', group: 'Duties & Taxes' },
      { name: 'Input GST - GRN related GST', group: 'Duties & Taxes' },
      { name: 'Employee list', group: 'Salary' },
      { name: 'Customer Advance Collection', group: 'Customer Advances' },
      { name: 'Gold Saving Scheme', group: 'Gold Scheme Liability' },
      { name: 'GRN raised before 27th January 2026', group: 'Capital Account' },
    ];

    const existingLedgers = await select(
      `SELECT ledger_no, ledger_name FROM ledger`
    );
    const ledgerNameExists = new Set(
      existingLedgers.map((l) => l.ledger_name.toLowerCase())
    );
    const nextLedgerNo = makeNextNo(
      existingLedgers.map((l) => l.ledger_no),
      'LAID'
    );

    const ledgerRows = [];
    const skipped = [];
    for (const l of LEDGERS) {
      if (ledgerNameExists.has(l.name.toLowerCase())) continue;
      const gId = groupId[l.group.toLowerCase()];
      if (!gId) {
        skipped.push(`${l.name} (parent group "${l.group}" not found)`);
        continue;
      }
      ledgerRows.push({
        ledger_no: nextLedgerNo(),
        ledger_name: l.name,
        ledger_group_id: gId,
        branch_id: 1,
        created_at: now,
        updated_at: now,
      });
    }

    if (ledgerRows.length) {
      await queryInterface.bulkInsert('ledger', ledgerRows, {});
    }
    if (skipped.length) {
      // eslint-disable-next-line no-console
      console.warn('[seed] Skipped ledgers (parent group missing):', skipped);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(
      'ledger',
      {
        ledger_name: [
          'Bank - UPI',
          'Bank - Card',
          'Cash Account',
          'Customer List',
          'Vendor List',
          'GRN',
          'Old Gold Purchase',
          'Sales',
          'Output GST - Sales related GST',
          'Input GST - GRN related GST',
          'Employee list',
          'Customer Advance Collection',
          'Gold Saving Scheme',
          'GRN raised before 27th January 2026',
        ],
      },
      {}
    );

    await queryInterface.bulkDelete(
      'ledger_group',
      {
        ledger_group_name: [
          'Salary',
          'Employee Claims',
          'Customer Advances',
          'Gold Scheme Liability',
        ],
      },
      {}
    );
  },
};
