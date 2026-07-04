'use strict';

/**
 * ADDITIVE: add the standard leaf ledgers under the 'Direct Income' group
 * (Making Charges Income, Wastage Charges Income, Repair Charges Income, Stone
 * Setting Charges, Certification Charges). Some databases have the Direct Income
 * GROUP but none of its leaves, so jewellery service income (esp. jewel repair,
 * which the financial reports post to 'Repair Charges Income') had nowhere to
 * land. Production-safe: INSERT only, matched BY NAME, idempotent, continues the
 * LAID#### sequence, single transaction.
 */

const norm = (s) => String(s || '').trim().toLowerCase();

const GROUP = 'Direct Income';
const LEAVES = [
  'Making Charges Income',
  'Wastage Charges Income',
  'Repair Charges Income',
  'Stone Setting Charges',
  'Certification Charges',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();
    const t = await sequelize.transaction();
    try {
      const select = (sql) =>
        sequelize.query(sql, { type: Sequelize.QueryTypes.SELECT, transaction: t });

      const grp = await select(
        `SELECT id FROM ledger_group WHERE ledger_group_name = '${GROUP}' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`
      );
      if (!grp.length) {
        // eslint-disable-next-line no-console
        console.warn(`[direct-income] group '${GROUP}' not found — nothing to do.`);
        await t.commit();
        return;
      }
      const gid = grp[0].id;

      const existing = await select(
        `SELECT ledger_name FROM ledger WHERE ledger_group_id = ${gid} AND deleted_at IS NULL`
      );
      const have = new Set(existing.map((l) => norm(l.ledger_name)));

      // Continue LAID#### across ALL rows (incl. soft-deleted).
      const allNos = await select(`SELECT ledger_no FROM ledger`);
      let max = 0;
      allNos.forEach((r) => {
        const m = String(r.ledger_no || '').match(/(\d+)\s*$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      const nextNo = () => `LAID${String(++max).padStart(3, '0')}`;

      const rows = [];
      const skipped = [];
      for (const name of LEAVES) {
        if (have.has(norm(name))) {
          skipped.push(name);
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
        have.add(norm(name));
      }

      if (rows.length) {
        await queryInterface.bulkInsert('ledger', rows, { transaction: t });
      }
      await t.commit();

      // eslint-disable-next-line no-console
      console.log(
        `[direct-income] created: ${rows.map((r) => r.ledger_name).join(', ') || 'none'}` +
          ` | skipped: ${skipped.join(', ') || 'none'}`
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // eslint-disable-next-line no-console
    console.warn('[direct-income] down() is a no-op by design (additive seeder).');
  },
};
