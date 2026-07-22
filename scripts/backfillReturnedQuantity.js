/**
 * One-time backfill: set returned_quantity on legacy FULL returns.
 *
 * WHY
 * Sales returns were originally full-return only, flagged with
 * sales_invoice_bill_items.is_returned = true. Partial returns introduced
 * returned_quantity, and every report now measures sales as
 * (quantity - returned_quantity) instead of filtering on is_returned.
 *
 * Rows returned BEFORE that change still carry is_returned = true with
 * returned_quantity = 0, so the new expression reads them as fully SOLD and
 * inflates revenue, quantity and weight. This sets returned_quantity = quantity
 * for exactly those rows.
 *
 * RUN THIS BEFORE DEPLOYING the is_returned -> returned_quantity report changes.
 *
 * Uses a DIRECT Sequelize connection (does NOT sync models) — safe to run
 * even while app.js is running.
 *
 * Usage:
 *   node scripts/backfillReturnedQuantity.js            → DRY RUN (shows before/after, rolls back)
 *   node scripts/backfillReturnedQuantity.js --apply    → commits the change
 *
 * Safe to re-run → the WHERE clause only matches rows still needing the fix,
 * so a second run reports 0 rows and changes nothing.
 */

require('dotenv').config();

const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        dialect: 'postgres',
        logging: false,
    }
);

const APPLY = process.argv.includes('--apply');

// Rows that are flagged fully returned but never had returned_quantity set.
const STALE_ROWS = `
    FROM sales_invoice_bill_items
    WHERE deleted_at IS NULL
      AND is_returned = true
      AND COALESCE(returned_quantity, 0) = 0
`;

// The sales figures every report now derives from returned_quantity.
const TOTALS_SQL = `
    SELECT
        COALESCE(SUM(i.quantity - COALESCE(i.returned_quantity, 0)), 0)                                    AS sold_qty,
        ROUND(COALESCE(SUM(i.gross_weight * (i.quantity - COALESCE(i.returned_quantity, 0))), 0), 3)       AS sold_gross_weight,
        ROUND(COALESCE(SUM(i.net_weight   * (i.quantity - COALESCE(i.returned_quantity, 0))), 0), 3)       AS sold_net_weight,
        ROUND(COALESCE(SUM(i.amount * (i.quantity - COALESCE(i.returned_quantity, 0))
                           / NULLIF(i.quantity, 0)), 0), 2)                                                AS sold_value
    FROM sales_invoice_bill_items i
    WHERE i.deleted_at IS NULL
`;

async function main() {
    const t = await sequelize.transaction();
    const q = (sql) => sequelize.query(sql, { transaction: t, type: QueryTypes.SELECT });

    try {
        console.log(`\n=== Backfill returned_quantity for legacy full returns ===`);
        console.log(`Mode: ${APPLY ? 'APPLY (will COMMIT)' : 'DRY RUN (will ROLLBACK)'}\n`);

        // ── Which rows need fixing ────────────────────────────────────────────
        const stale = await q(`
            SELECT id, invoice_bill_id, product_id, quantity, returned_quantity, is_returned, amount
            ${STALE_ROWS}
            ORDER BY id
        `);

        console.log(`Rows needing backfill: ${stale.length}`);

        if (stale.length === 0) {
            console.log('Nothing to do — already backfilled.\n');
            await t.rollback();
            await sequelize.close();
            return;
        }

        console.table(stale);

        // ── BEFORE ────────────────────────────────────────────────────────────
        const [before] = await q(TOTALS_SQL);
        console.log('\nBEFORE — sales totals as the reports currently compute them:');
        console.table([before]);

        // ── Apply ─────────────────────────────────────────────────────────────
        const [, meta] = await sequelize.query(
            `UPDATE sales_invoice_bill_items
                SET returned_quantity = quantity,
                    updated_at        = NOW()
              WHERE deleted_at IS NULL
                AND is_returned = true
                AND COALESCE(returned_quantity, 0) = 0`,
            { transaction: t }
        );
        console.log(`\nUpdated ${meta.rowCount} row(s).`);

        // ── AFTER ─────────────────────────────────────────────────────────────
        const [after] = await q(TOTALS_SQL);
        console.log('\nAFTER — corrected sales totals:');
        console.table([after]);

        const delta = (k) => (Number(after[k]) - Number(before[k])).toFixed(k === 'sold_qty' ? 0 : 2);
        console.log('\nChange (after - before):');
        console.table([{
            sold_qty: delta('sold_qty'),
            sold_gross_weight: delta('sold_gross_weight'),
            sold_net_weight: delta('sold_net_weight'),
            sold_value: delta('sold_value'),
        }]);
        console.log('Negative numbers are expected — this REMOVES phantom sales.');

        // ── Leftover check (idempotence proof) ────────────────────────────────
        const [{ remaining }] = await q(`SELECT COUNT(*)::int AS remaining ${STALE_ROWS}`);
        console.log(`\nRows still needing backfill after the update: ${remaining} (expected 0)`);

        if (APPLY) {
            await t.commit();
            console.log('\nCOMMITTED.\n');
        } else {
            await t.rollback();
            console.log('\nROLLED BACK — nothing was changed.');
            console.log('Re-run with --apply to commit.\n');
        }
    } catch (err) {
        if (!t.finished) await t.rollback();
        console.error('\nFAILED — rolled back:', err.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
}

main();
