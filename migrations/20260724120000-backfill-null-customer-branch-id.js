'use strict';

/**
 * Customers who signed up through the website (OTP flow in authService) were
 * created without a branch, so they sit at branch_id = NULL and fall out of
 * every branch-wise customer report and filter.
 *
 * verifyOTP now stamps ONLINE_CUSTOMER_BRANCH_ID (1) on new signups and
 * backfills existing ones at their next login; this fixes the ones already in
 * the table so they don't have to log in first. Only NULL rows are touched —
 * an offline customer keeps the branch that actually created them.
 */
const ONLINE_CUSTOMER_BRANCH_ID = 1;

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();
    const t = await sequelize.transaction();
    try {
      const branch = await sequelize.query(
        `SELECT id FROM branches WHERE id = :bid AND deleted_at IS NULL`,
        {
          replacements: { bid: ONLINE_CUSTOMER_BRANCH_ID },
          type: Sequelize.QueryTypes.SELECT,
          transaction: t,
        }
      );
      if (!branch.length) {
        // eslint-disable-next-line no-console
        console.warn(
          `[backfill-cust-branch] branch ${ONLINE_CUSTOMER_BRANCH_ID} not found — skipped.`
        );
        await t.commit();
        return;
      }

      const [, meta] = await sequelize.query(
        `UPDATE customers SET branch_id = :bid, updated_at = :now
         WHERE branch_id IS NULL AND deleted_at IS NULL`,
        {
          replacements: { bid: ONLINE_CUSTOMER_BRANCH_ID, now },
          transaction: t,
        }
      );

      await t.commit();
      // eslint-disable-next-line no-console
      console.log(
        `[backfill-cust-branch] set branch_id = ${ONLINE_CUSTOMER_BRANCH_ID} on ${
          meta?.rowCount ?? 0
        } customer(s).`
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // eslint-disable-next-line no-console
    console.warn('[backfill-cust-branch] down() is a no-op (data backfill).');
  },
};
