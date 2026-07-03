'use strict';

/**
 * ADDITIVE: add a 'Round Off' leaf ledger under BOTH 'Indirect Income' and
 * 'Indirect Expenses'.
 *
 * The financial reports (trial balance / P&L / balance sheet) route invoice &
 * GRN rounding to these leaves — a rounding that leaves the business WORSE off
 * (sale collected less / purchase paid more) posts to Indirect Expenses -> Round
 * Off; BETTER off (collected more / paid less) posts to Indirect Income -> Round
 * Off. Until this runs, those legs fall back to 'Discount Received' (the report
 * still balances), so running this is what MOVES them onto the proper leaves.
 *
 * Production-safe: INSERT only, matched BY NAME, idempotent (skips a leaf that
 * already exists under its group), continues the LAID#### code sequence, and
 * runs in one transaction. Never changes an existing id.
 */

const norm = (s) => String(s || '').trim().toLowerCase();

// [ledger_name, ledger_group_name]
const TARGETS = [
  ['Round Off', 'Indirect Income'],
  ['Round Off', 'Indirect Expenses'],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();
    const t = await sequelize.transaction();

    try {
      const select = (sql) =>
        sequelize.query(sql, { type: Sequelize.QueryTypes.SELECT, transaction: t });

      // Resolve groups by name -> lowest id (deterministic on duplicates).
      const groups = await select(
        `SELECT id, ledger_group_name FROM ledger_group WHERE deleted_at IS NULL ORDER BY id ASC`
      );
      const groupId = {};
      groups.forEach((g) => {
        const k = norm(g.ledger_group_name);
        if (groupId[k] == null) groupId[k] = g.id;
      });

      // Existing leaves, to skip anything already present.
      const existing = await select(
        `SELECT ledger_group_id, ledger_name FROM ledger WHERE deleted_at IS NULL`
      );
      const have = new Set(
        existing.map((l) => `${l.ledger_group_id}::${norm(l.ledger_name)}`)
      );

      // Continue LAID#### across ALL rows (incl. soft-deleted): the unique index
      // on ledger_no is not partial, so a code colliding with a soft-deleted row
      // would abort the transaction.
      const allNos = await select(`SELECT ledger_no FROM ledger`);
      let max = 0;
      allNos.forEach((r) => {
        const m = String(r.ledger_no || '').match(/(\d+)\s*$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      const nextNo = () => `LAID${String(++max).padStart(3, '0')}`;

      const rows = [];
      const skipped = [];
      for (const [name, group] of TARGETS) {
        const gid = groupId[norm(group)];
        if (gid == null) {
          skipped.push(`${name} (group '${group}' not found)`);
          continue;
        }
        if (have.has(`${gid}::${norm(name)}`)) {
          skipped.push(`${name} (already under ${group})`);
          continue;
        }
        rows.push({
          ledger_no: nextNo(),
          ledger_group_id: gid,
          ledger_name: name,
          branch_id: 1,
          created_at: now,
          updated_at: now,
        });
        have.add(`${gid}::${norm(name)}`);
      }

      if (rows.length) {
        await queryInterface.bulkInsert('ledger', rows, { transaction: t });
      }
      await t.commit();

      // eslint-disable-next-line no-console
      console.log(
        `[round-off] ledgers created: ${rows.length}` +
          ` (${rows.map((r) => r.ledger_name).join(', ') || 'none'})\n` +
          `[round-off] skipped: ${skipped.join(', ') || 'none'}`
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  // Additive seeder: down() is a no-op so it can never delete a real 'Round Off'
  // ledger that may already carry postings. Remove manually if ever required.
  async down() {
    // eslint-disable-next-line no-console
    console.warn('[round-off] down() is a no-op by design (additive seeder).');
  },
};
