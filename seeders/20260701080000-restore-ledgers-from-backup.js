'use strict';

const fs = require('fs');
const path = require('path');

/**
 * ONE-TIME live recovery. The live `ledger` / `ledger_group` were fully deleted and
 * re-seeded with only the standard chart, so the ~1150 customer/vendor ledgers are
 * gone and customers.ledger_id / vendors.ledger_id are orphaned.
 *
 * This seeder WIPES ledger + ledger_group and REBUILDS them from the pre-incident
 * backup extract, restoring EVERY row (incl. all ~1150 customer/vendor ledgers) at
 * its ORIGINAL id — so customers.ledger_id / vendors.ledger_id re-link automatically
 * (the old ids 1..1150 are free again because the current leaves start at 1151).
 *
 * It reads the backup .sql (default <repo root>/retailerpdb-jun12026.sql, override
 * with env LEDGER_BACKUP_SQL) and extracts ONLY the INSERT statements — it NEVER runs
 * the dump's DROP/CREATE. Everything happens in ONE transaction:
 *   1. DELETE FROM ledger;  DELETE FROM ledger_group;      (full wipe, as requested)
 *   2. re-INSERT ledger_group, then ledger, all at their ORIGINAL ids
 *      (ledger_accounts / natures are NOT touched — the 4 already exist)
 *   3. realign the ledger_group + ledger id sequences to MAX(id) so new creates
 *      continue cleanly (next ledger id = 1151+, next group id past the restored max)
 *
 * TABLES CHANGED: exactly `ledger` and `ledger_group` (data) plus their id sequences.
 * No other table — customers, vendors, invoices, payments, journal entries, vouchers —
 * is written; the restore simply makes their existing ledger_id links valid again.
 *
 * AFTER this, run 20260701090000-add-missing-chart-of-accounts to standardise the
 * chart (it preserves Sundry Debtors 26 / Sundry Creditors 9 and every restored row).
 *
 * WARNING: this deletes the CURRENT ledger/ledger_group (incl. the 83 post-incident
 * standard leaves and any ledgers created since the reset). BACK UP FIRST. If a
 * foreign key blocks the DELETE, the whole transaction rolls back — resolve the
 * referencing rows and re-run.
 */

const DEFAULT_FILE = 'retailerpdb-jun12026.sql';

// Pull each `INSERT INTO ... <table> ... ;` block out of the dump text.
const extractInserts = (sql) => {
  const re =
    /INSERT\s+INTO\s+("?public"?\.)?"?(ledger_accounts|ledger_group|ledger)"?[\s\S]*?;\s*(?=(?:--|INSERT\s+INTO|CREATE|DROP|ALTER|COMMIT|BEGIN|$))/gi;
  const out = {};
  let m;
  while ((m = re.exec(sql)) !== null) {
    const table = m[2].toLowerCase();
    if (!out[table]) out[table] = m[0].trim().replace(/;\s*$/, ''); // keep the first (data) INSERT
  }
  return out;
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    const file =
      process.env.LEDGER_BACKUP_SQL || path.resolve(process.cwd(), DEFAULT_FILE);

    if (!fs.existsSync(file)) {
      throw new Error(
        `[restore] backup dump not found at "${file}". ` +
          `Place ${DEFAULT_FILE} at the repo root, or set LEDGER_BACKUP_SQL to its full path.`
      );
    }

    const dump = fs.readFileSync(file, 'utf8');
    const inserts = extractInserts(dump);
    for (const tbl of ['ledger_group', 'ledger']) {
      if (!inserts[tbl]) {
        throw new Error(`[restore] could not find an INSERT for "${tbl}" in ${file}.`);
      }
    }

    const t = await sequelize.transaction();
    try {
      // 1. Full wipe — children (ledger) before parent (ledger_group).
      await sequelize.query('DELETE FROM public.ledger;', { transaction: t });
      await sequelize.query('DELETE FROM public.ledger_group;', { transaction: t });

      // 2. Rebuild ONLY these two tables from the backup, at ORIGINAL ids.
      //    (ledger_accounts / natures are left untouched — the 4 already exist.)
      await sequelize.query(`${inserts.ledger_group};`, { transaction: t });
      await sequelize.query(`${inserts.ledger};`, { transaction: t });

      // 3. Realign the two id sequences so future auto-increments don't collide.
      for (const tbl of ['ledger_group', 'ledger']) {
        await sequelize.query(
          `SELECT setval(pg_get_serial_sequence('public.${tbl}', 'id'),
                         (SELECT COALESCE(MAX(id), 1) FROM public.${tbl}))
             WHERE pg_get_serial_sequence('public.${tbl}', 'id') IS NOT NULL;`,
          { transaction: t }
        );
      }

      await t.commit();

      const [{ g }] = await sequelize.query(
        'SELECT COUNT(*)::int AS g FROM public.ledger_group',
        { type: Sequelize.QueryTypes.SELECT }
      );
      const [{ l }] = await sequelize.query(
        'SELECT COUNT(*)::int AS l FROM public.ledger',
        { type: Sequelize.QueryTypes.SELECT }
      );
      // eslint-disable-next-line no-console
      console.log(
        `[restore] rebuilt from ${file}: ${g} ledger_group rows, ${l} ledger rows, ` +
          `sequences realigned. Now run 20260701090000-add-missing-chart-of-accounts.`
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // eslint-disable-next-line no-console
    console.warn(
      '[restore] down() is a no-op by design (one-time data-recovery seeder).'
    );
  },
};
