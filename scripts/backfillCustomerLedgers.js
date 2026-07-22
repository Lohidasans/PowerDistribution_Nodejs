/**
 * One-time backfill: give every customer a 'Sundry Debtors' ledger.
 *
 * WHY
 * The financial reports post the customer leg of a sales invoice / sales return
 * / old-gold voucher to the customer's ledger, and reach it by INNER JOIN:
 *
 *     JOIN customers c ON c.id = r.customer_id
 *     JOIN ledger    l ON l.id = c.ledger_id
 *
 * A customer with ledger_id = NULL therefore does not merely lose one line —
 * the join DROPS the whole voucher from the trial balance, P&L and balance
 * sheet. Offline customers always got a ledger at creation; the online OTP
 * registration flow did not, so those customers' vouchers are invisible.
 *
 * authService now creates the ledger at OTP verification, which repairs each
 * affected customer on their NEXT LOGIN. This script repairs them immediately,
 * including anyone who never logs in again.
 *
 * SCOPE — a missing ledger is not the only way a voucher gets dropped. The same
 * joins also carry `AND c.deleted_at IS NULL`, so SOFT-DELETING a customer
 * retroactively erases their historical vouchers from the reports even though
 * their ledger still exists and still holds the balance. This script does NOT
 * fix that; the before/after table will keep showing a shortfall for any flow
 * affected by it. Fixing it means changing the joins in financialReportService.
 *
 * Mirrors ensureCustomerLedger() in services/customerService.js. Kept as raw
 * SQL rather than importing that helper because loading models/index.js runs
 * sequelize.sync() — this script uses a DIRECT connection (does NOT sync
 * models), so it is safe to run even while app.js is running.
 *
 * Usage:
 *   node scripts/backfillCustomerLedgers.js            → DRY RUN (shows before/after, rolls back)
 *   node scripts/backfillCustomerLedgers.js --apply    → commits the change
 *
 * Safe to re-run → only customers with a missing/deleted ledger are selected,
 * so a second run reports 0 customers and creates nothing.
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

// A customer needs a ledger if they have none, or point at a soft-deleted one.
const NEEDS_LEDGER = `
    FROM customers c
    WHERE c.deleted_at IS NULL
      AND (
        c.ledger_id IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM ledger l
             WHERE l.id = c.ledger_id AND l.deleted_at IS NULL
        )
      )
`;

// How many vouchers the reports keep vs. how many actually exist. These must be
// equal, otherwise the INNER JOIN above is silently discarding money.
const REPORT_IMPACT_SQL = `
    SELECT 'Sales returns (F.2)' AS voucher_flow,
           (SELECT COUNT(*) FROM sales_returns r
              JOIN customers c ON c.id = r.customer_id AND c.deleted_at IS NULL
              JOIN ledger    l ON l.id = c.ledger_id  AND l.deleted_at IS NULL
             WHERE r.deleted_at IS NULL AND r.is_active = true
               AND r.is_bill_adjusted = false
               AND r.status NOT IN ('Draft','Cancelled','On Hold'))::int AS kept,
           (SELECT COUNT(*) FROM sales_returns r
             WHERE r.deleted_at IS NULL AND r.is_active = true
               AND r.is_bill_adjusted = false
               AND r.status NOT IN ('Draft','Cancelled','On Hold'))::int AS total,
           (SELECT ROUND(COALESCE(SUM(COALESCE(r.total_amount,0) - COALESCE(r.cgst_amount,0)
                                    - COALESCE(r.sgst_amount,0) - COALESCE(r.igst_amount,0)), 0), 2)
              FROM sales_returns r
              JOIN customers c ON c.id = r.customer_id AND c.deleted_at IS NULL
              JOIN ledger    l ON l.id = c.ledger_id  AND l.deleted_at IS NULL
             WHERE r.deleted_at IS NULL AND r.is_active = true
               AND r.is_bill_adjusted = false
               AND r.status NOT IN ('Draft','Cancelled','On Hold')) AS amount_posted,
           (SELECT ROUND(COALESCE(SUM(COALESCE(r.total_amount,0) - COALESCE(r.cgst_amount,0)
                                    - COALESCE(r.sgst_amount,0) - COALESCE(r.igst_amount,0)), 0), 2)
              FROM sales_returns r
             WHERE r.deleted_at IS NULL AND r.is_active = true
               AND r.is_bill_adjusted = false
               AND r.status NOT IN ('Draft','Cancelled','On Hold')) AS amount_expected

    UNION ALL

    SELECT 'Old gold (F.1)',
           (SELECT COUNT(*) FROM old_jewels oj
              JOIN customers c ON c.id = oj.customer_id AND c.deleted_at IS NULL
              JOIN ledger    l ON l.id = c.ledger_id   AND l.deleted_at IS NULL
             WHERE oj.deleted_at IS NULL AND oj.is_active = true
               AND oj.is_bill_adjusted = false AND oj.status = 'Printed')::int,
           (SELECT COUNT(*) FROM old_jewels oj
             WHERE oj.deleted_at IS NULL AND oj.is_active = true
               AND oj.is_bill_adjusted = false AND oj.status = 'Printed')::int,
           (SELECT ROUND(COALESCE(SUM(oj.total_amount), 0), 2) FROM old_jewels oj
              JOIN customers c ON c.id = oj.customer_id AND c.deleted_at IS NULL
              JOIN ledger    l ON l.id = c.ledger_id   AND l.deleted_at IS NULL
             WHERE oj.deleted_at IS NULL AND oj.is_active = true
               AND oj.is_bill_adjusted = false AND oj.status = 'Printed'),
           (SELECT ROUND(COALESCE(SUM(oj.total_amount), 0), 2) FROM old_jewels oj
             WHERE oj.deleted_at IS NULL AND oj.is_active = true
               AND oj.is_bill_adjusted = false AND oj.status = 'Printed')
`;

async function main() {
    const t = await sequelize.transaction();
    const q = (sql, replacements) =>
        sequelize.query(sql, { transaction: t, replacements, type: QueryTypes.SELECT });

    try {
        console.log(`\n=== Backfill Sundry Debtors ledgers for customers ===`);
        console.log(`Mode: ${APPLY ? 'APPLY (will COMMIT)' : 'DRY RUN (will ROLLBACK)'}\n`);

        // ── Resolve the target group by NAME, never a hardcoded id ────────────
        const grp = await q(`
            SELECT id FROM ledger_group
             WHERE ledger_group_name = 'Sundry Debtors' AND deleted_at IS NULL
             ORDER BY id LIMIT 1
        `);

        if (!grp.length) {
            throw new Error(
                "Ledger group 'Sundry Debtors' not found. Seed the chart of accounts first."
            );
        }
        const groupId = grp[0].id;

        // ── Who needs a ledger ────────────────────────────────────────────────
        const targets = await q(`
            SELECT c.id, c.customer_code, c.customer_name, c.mobile_number,
                   c.branch_id, c.ledger_id
            ${NEEDS_LEDGER}
            ORDER BY c.id
        `);

        console.log(`Customers without a usable ledger: ${targets.length}`);

        // ── BEFORE ────────────────────────────────────────────────────────────
        console.log('\nBEFORE — vouchers the financial report currently keeps:');
        console.table(await q(REPORT_IMPACT_SQL));

        if (targets.length === 0) {
            console.log('Nothing to do — every customer already has a ledger.\n');
            await t.rollback();
            await sequelize.close();
            return;
        }

        console.table(targets);

        // ── Create one ledger per customer ────────────────────────────────────
        // Sequential so each ledger_no is derived from the previous insert, which
        // is what keeps the unique constraint on ledger.ledger_no satisfied.
        const created = [];

        for (const cust of targets) {
            // Only rows shaped LAID<digits> participate in the numbering, so a
            // hand-entered ledger_no cannot break the CAST.
            const [{ next_no }] = await q(`
                SELECT COALESCE(MAX(CAST(SUBSTRING(ledger_no FROM 5) AS INTEGER)), 0) + 1 AS next_no
                  FROM ledger
                 WHERE ledger_no ~* '^LAID[0-9]+$'
            `);

            const ledgerNo = `LAID${String(next_no).padStart(3, '0')}`;
            // ledger_name is NOT NULL and online customers may have no name yet.
            const ledgerName = (cust.customer_name || '').trim() || cust.mobile_number;

            const [row] = await q(
                `INSERT INTO ledger (ledger_no, ledger_group_id, ledger_name, branch_id, created_at, updated_at)
                 VALUES (:ledgerNo, :groupId, :ledgerName, :branchId, NOW(), NOW())
                 RETURNING id, ledger_no, ledger_name`,
                { ledgerNo, groupId, ledgerName, branchId: cust.branch_id }
            );

            await sequelize.query(
                `UPDATE customers SET ledger_id = :ledgerId, updated_at = NOW() WHERE id = :customerId`,
                { transaction: t, replacements: { ledgerId: row.id, customerId: cust.id } }
            );

            created.push({
                customer_id: cust.id,
                customer_code: cust.customer_code,
                customer_name: cust.customer_name || '(no name yet)',
                ledger_id: row.id,
                ledger_no: row.ledger_no,
                ledger_name: row.ledger_name,
            });
        }

        console.log(`\nCreated ${created.length} ledger(s):`);
        console.table(created);

        // ── AFTER ─────────────────────────────────────────────────────────────
        console.log('\nAFTER — vouchers the financial report now keeps:');
        console.table(await q(REPORT_IMPACT_SQL));

        // ── Leftover check (idempotence proof) ────────────────────────────────
        const [{ remaining }] = await q(`SELECT COUNT(*)::int AS remaining ${NEEDS_LEDGER}`);
        console.log(`\nCustomers still without a ledger: ${remaining} (expected 0)`);

        // ── Guard: never leave two customers sharing one ledger ───────────────
        const dupes = await q(`
            SELECT ledger_id, COUNT(*)::int AS customers
              FROM customers
             WHERE deleted_at IS NULL AND ledger_id IS NOT NULL
             GROUP BY ledger_id HAVING COUNT(*) > 1
        `);

        if (dupes.length) {
            console.log('\nWARNING — these ledgers are shared by more than one customer:');
            console.table(dupes);
        } else {
            console.log('Ledger ownership is 1:1 across all customers.');
        }

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
