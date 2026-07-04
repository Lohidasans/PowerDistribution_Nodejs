'use strict';

/**
 * Every customer is supposed to get a Sundry Debtors ledger at creation
 * (customerService), but a few legacy/partially-created customers ended up with
 * ledger_id = NULL (e.g. "Surya"). Any transaction that posts a receivable to
 * such a customer (sales invoice, old gold, jewel repair …) then can't resolve a
 * ledger, so the leg drops and the trial balance goes out of balance.
 *
 * This backfills a Sundry Debtors ledger for every customer that is missing one
 * (mirrors customerService), then points customer.ledger_id at it. Idempotent —
 * customers that already have a valid ledger are skipped.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();
    const t = await sequelize.transaction();
    const sel = (sql) =>
      sequelize.query(sql, { type: Sequelize.QueryTypes.SELECT, transaction: t });
    try {
      const grp = await sel(
        `SELECT id FROM ledger_group WHERE ledger_group_name = 'Sundry Debtors'
           AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`
      );
      if (!grp.length) {
        // eslint-disable-next-line no-console
        console.warn("[backfill-cust-ledger] 'Sundry Debtors' group not found — skipped.");
        await t.commit();
        return;
      }
      const groupId = grp[0].id;

      const missing = await sel(`
        SELECT c.id, c.customer_name, c.branch_id
        FROM customers c
        WHERE c.deleted_at IS NULL
          AND (c.ledger_id IS NULL
               OR NOT EXISTS (SELECT 1 FROM ledger l
                              WHERE l.id = c.ledger_id AND l.deleted_at IS NULL))
        ORDER BY c.id`);

      if (!missing.length) {
        // eslint-disable-next-line no-console
        console.log('[backfill-cust-ledger] no customers missing a ledger.');
        await t.commit();
        return;
      }

      // Continue the LAID#### sequence across ALL ledger rows (incl. soft-deleted).
      const allNos = await sel(`SELECT ledger_no FROM ledger`);
      let max = 0;
      allNos.forEach((r) => {
        const m = String(r.ledger_no || '').match(/(\d+)\s*$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      const nextNo = () => `LAID${String(++max).padStart(3, '0')}`;

      for (const c of missing) {
        const [led] = await sequelize.query(
          `INSERT INTO ledger (ledger_no, ledger_group_id, ledger_name, branch_id, created_at, updated_at)
           VALUES (:no, :gid, :name, :branch, :now, :now) RETURNING id`,
          {
            replacements: {
              no: nextNo(),
              gid: groupId,
              name: c.customer_name,
              branch: c.branch_id || 1,
              now,
            },
            type: Sequelize.QueryTypes.INSERT,
            transaction: t,
          }
        );
        const newLedgerId = led[0].id;
        await sequelize.query(
          `UPDATE customers SET ledger_id = :lid, updated_at = :now WHERE id = :cid`,
          { replacements: { lid: newLedgerId, now, cid: c.id }, transaction: t }
        );
      }

      await t.commit();
      // eslint-disable-next-line no-console
      console.log(
        `[backfill-cust-ledger] created ledgers for: ${missing.map((c) => c.customer_name).join(', ')}`
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // eslint-disable-next-line no-console
    console.warn('[backfill-cust-ledger] down() is a no-op (data backfill).');
  },
};
