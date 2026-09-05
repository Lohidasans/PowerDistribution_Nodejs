// Read-only PostgreSQL regression checks using synthetic rows, not application data.
// Run: node scripts/testRevenueCashBalance.js
require('dotenv').config();
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { revenueDateFilter } = require('../helpers/revenueDateFilter');

const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
});

async function totals(filters, branchId = 1, periodOnly = false) {
    const replacements = {};
    const conditions = revenueDateFilter(filters, replacements);
    const condition = conditions[periodOnly ? 'periodCondition' : 'balanceCondition'];
    const params = [];
    const sqlCondition = condition.replace(/:(from_date|to_date)\b/g, (_, key) => {
        params.push(replacements[key]);
        return `$${params.length}::date`;
    });
    params.push(branchId);
    const { rows } = await client.query(`
        WITH revenue_stream(branch_id, txn_date, payment_mode, amount) AS (
            VALUES
                (1, DATE '2026-09-01', 'Cash', 1000::numeric),
                (1, DATE '2026-09-05', 'Cash', -100::numeric),
                (1, DATE '2026-09-11', 'Cash', 50::numeric),
                (1, DATE '2026-09-11', 'Cash', -300::numeric),
                (1, DATE '2026-09-12', 'Cash', -200::numeric),
                (1, DATE '2026-09-01', 'UPI', 400::numeric),
                (1, DATE '2026-09-11', 'UPI', 80::numeric),
                (1, DATE '2026-09-01', 'Card', 500::numeric),
                (1, DATE '2026-09-11', 'Card', 60::numeric),
                (2, DATE '2026-09-01', 'Cash', 9999::numeric)
        )
        SELECT
            COALESCE(SUM(amount) FILTER (WHERE payment_mode = 'Cash'), 0)::float AS cash,
            COALESCE(SUM(amount) FILTER (WHERE payment_mode = 'UPI'), 0)::float AS upi,
            COALESCE(SUM(amount) FILTER (WHERE payment_mode = 'Card'), 0)::float AS card,
            COALESCE(SUM(amount), 0)::float AS total
        FROM revenue_stream rs
        WHERE rs.branch_id = $${params.length} ${sqlCondition}
    `, params);
    return rows[0];
}

(async () => {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const day11 = { from_date: '2026-09-11', to_date: '2026-09-11' };
    // Earlier collections and prior payments carry forward; future payments do not.
    assert.deepEqual(await totals(day11), { cash: 650, upi: 80, card: 60, total: 790 });
    // Transaction detail rows remain limited to the selected day.
    assert.deepEqual(await totals(day11, 1, true), { cash: -250, upi: 80, card: 60, total: -110 });
    assert.equal((await totals({ from_date: '2026-09-10', to_date: '2026-09-10' })).cash, 900);
    assert.equal((await totals({ from_date: '2026-09-12', to_date: '2026-09-12' })).cash, 450);
    assert.equal((await totals(day11, 2)).cash, 9999);
    assert.equal((await totals(day11, 3)).cash, 0);
    assert.deepEqual(await totals({ to_date: '2026-09-11' }), { cash: 650, upi: 480, card: 560, total: 1690 });
    assert.deepEqual(await totals({}), { cash: 450, upi: 480, card: 560, total: 1490 });
    console.log('Passed 8 revenue cash balance regression checks.');
})().catch(error => {
    console.error('Revenue regression checks failed:', error.message);
    process.exitCode = 1;
}).finally(async () => {
    await client.end();
});
