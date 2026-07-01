'use strict';

/**
 * ADDITIVE chart-of-accounts sync for an EXISTING (production) database.
 *
 * Goal: bring an old production `ledger_group` / `ledger` up to the new standard
 * chart (the same chart produced by 20260630120000-jewellery-chart-of-accounts)
 * WITHOUT disturbing anything that is already there.
 *
 * Guarantees (production safety):
 *   - Only ever INSERTs new rows, with ONE approved exception: groups listed in
 *     GROUP_ALIASES (e.g. "Direct Incomes") are RENAMED to the standard name.
 *     Only the name changes — the id, and everything referencing it, is preserved.
 *   - NEVER changes an existing id. Existing groups are matched BY NAME and reused,
 *     so Sundry Debtors (id 26) / Sundry Creditors (id 9) — and every customer /
 *     vendor ledger already created under them — stay exactly as they are.
 *   - On duplicate group names (e.g. two "Sundry Debtors"), the LOWEST id is used,
 *     which is the live group that already holds customers/vendors.
 *   - Codes continue the existing LGID### / LAID### sequences (never reused).
 *   - Everything runs in a single transaction: partial failure rolls back cleanly.
 *
 * This is the counterpart to 20260630120000-jewellery-chart-of-accounts, which
 * TRUNCATEs and is DEV/DEMO ONLY. Run exactly ONE of the two against a given
 * database — never both.
 *
 * Sundry Debtors / Sundry Creditors intentionally have NO leaf ledgers here: the
 * app fills them at runtime (customerService / vendorService).
 */

// nature => [ [groupName, [...ledgerNames]] ]   (leaf list may be empty)
const CHART = {
  Asset: [
    ['Current Assets', [
      'Cash in Hand',
      'Bank Accounts',
      'UPI Collections',
      'Card Collections',
      'Customer Receivables',
      'GST Input CGST',
      'GST Input SGST',
      'GST Input IGST',
    ]],
    ['Sundry Debtors', []], // GROUP — customers attach here at runtime
    ['Stock in Hand', [
      'Gold Stock',
      'Silver Stock',
      'Stone Stock',
    ]],
    ['Fixed Assets', [
      'Building',
      'Furniture',
      'Computer',
      'Printer',
      'CCTV',
      'Vehicle',
      'Gold Testing Machine',
    ]],
    ['Deposits', [
      'Rental Deposit',
      'Electricity Deposit',
      'Telephone Deposit',
    ]],
    ['Loans & Advances', [
      'Staff Advance',
      'Supplier Advance',
      'Advance Tax',
      'Branch Advance',
    ]],
  ],

  Liability: [
    ['Capital Account', [
      'Capital A/c',
      'Drawings',
      'Reserve & Surplus',
    ]],
    ['Current Liabilities', [
      'Outstanding Expenses',
      'Salary Payable',
      'Rent Payable',
      'Customer Advance',
      'Scheme Collection Liability',
    ]],
    ['Sundry Creditors', []], // GROUP — vendors attach here at runtime
    ['Duties & Taxes', [
      'Output CGST',
      'Output SGST',
      'Output IGST',
      'TDS Payable',
      'TCS Payable',
    ]],
    ['Loans & Borrowings', [
      'Gold Loan',
      'Bank Loan',
      'Vehicle Loan',
      'OD Account',
      'CC Account',
    ]],
  ],

  Income: [
    ['Sales Accounts', [
      'Sales Accounts', // catch-all posting ledger the financial reports match via ILIKE 'SALES ACCOUNTS'
      'Gold Sales',
      'Silver Sales',
      'Diamond Sales',
      'Stone Sales',
      'Old Gold Sales',
      'Sales Return',
    ]],
    ['Direct Income', [
      'Making Charges Income',
      'Wastage Charges Income',
      'Repair Charges Income',
      'Stone Setting Charges',
      'Certification Charges',
    ]],
    ['Indirect Income', [
      'Interest Received',
      'Discount Received',
      'Commission Received',
      'Rental Income',
    ]],
  ],

  Expense: [
    ['Purchase Accounts', [
      'Purchase Accounts', // catch-all posting ledger the financial reports match via ILIKE 'PURCHASE ACCOUNTS'
      'Gold Purchase',
      'Silver Purchase',
      'Diamond Purchase',
      'Stone Purchase',
      'Old Gold Purchase',
      'Purchase Return',
    ]],
    ['Direct Expenses', [
      'Hallmark Charges',
      'Karigar Charges',
      'Stone Purchase Cost',
      'Import Charges',
      'Wastage Expense',
      'Manufacturing Charges',
    ]],
    ['Indirect Expenses', [
      'Salary',
      'Rent',
      'Electricity',
      'Internet',
      'Telephone',
      'Advertisement',
      'Printing',
      'Stationery',
      'Audit Fees',
      'Professional Charges',
      'Bank Charges',
      'Courier Charges',
      'Travelling Expenses',
    ]],
  ],
};

// Nature -> normal_balance, used only if a nature row has to be created.
const NATURE_BALANCE = {
  Asset: 'Debit',
  Liability: 'Credit',
  Income: 'Credit',
  Expense: 'Debit',
};

// Legacy group names to fold into the standard chart. If a legacy group exists,
// it is REUSED (id — and all customer/vendor/txn references — kept) and RENAMED
// to the standard name. Verified safe for the P&L report, which buckets by
// nature + the "indirect" substring, not the exact group name.
const GROUP_ALIASES = {
  'Direct Income': ['Direct Incomes'],
  'Indirect Income': ['Indirect Incomes'],
};

const norm = (s) => String(s || '').trim().toLowerCase();

// Yields the next `${prefix}NNN` code, continuing from the highest numeric
// suffix already present in `values`.
const makeNextNo = (values, prefix) => {
  let max = 0;
  values.forEach((v) => {
    const m = String(v || '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  let n = max;
  return () => `${prefix}${String(++n).padStart(3, '0')}`;
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();
    const t = await sequelize.transaction();

    const createdGroups = [];
    const renamedGroups = []; // { id, from, to } — aliased legacy groups renamed
    const createdLedgers = [];
    const reusedGroups = [];
    const skippedLedgers = [];

    try {
      const select = (sql) =>
        sequelize.query(sql, {
          type: Sequelize.QueryTypes.SELECT,
          transaction: t,
        });

      /* 1. Natures (ledger_accounts): resolve by name, create any missing. */
      let natures = await select(
        `SELECT id, account_name FROM ledger_accounts WHERE deleted_at IS NULL`
      );
      const natureId = {};
      natures.forEach((r) => {
        if (natureId[norm(r.account_name)] == null) natureId[norm(r.account_name)] = r.id;
      });

      const missingNatures = Object.keys(CHART)
        .filter((n) => natureId[norm(n)] == null)
        .map((n) => ({
          account_name: n,
          normal_balance: NATURE_BALANCE[n],
          status_id: 1,
          created_at: now,
          updated_at: now,
        }));
      if (missingNatures.length) {
        await queryInterface.bulkInsert('ledger_accounts', missingNatures, {
          transaction: t,
        });
        natures = await select(
          `SELECT id, account_name FROM ledger_accounts WHERE deleted_at IS NULL`
        );
        natures.forEach((r) => {
          if (natureId[norm(r.account_name)] == null) natureId[norm(r.account_name)] = r.id;
        });
      }

      /* 2. Existing groups: name -> lowest id (deterministic on duplicates). */
      const existingGroups = await select(
        `SELECT id, ledger_group_no, ledger_group_name
           FROM ledger_group WHERE deleted_at IS NULL ORDER BY id ASC`
      );
      const groupIdByName = {};
      existingGroups.forEach((g) => {
        const k = norm(g.ledger_group_name);
        if (groupIdByName[k] == null) groupIdByName[k] = g.id; // lowest id wins
      });
      // Numbering must consider ALL rows (incl. soft-deleted): the UNIQUE index on
      // ledger_group_no is NOT partial, so a new code colliding with a soft-deleted
      // row (e.g. LGID027 'xyz') would abort the whole transaction.
      const allGroupNos = await select(`SELECT ledger_group_no FROM ledger_group`);
      const nextGroupNo = makeNextNo(
        allGroupNos.map((g) => g.ledger_group_no),
        'LGID'
      );

      /* 3. Resolve each standard group:
             (a) exact name exists  -> reuse (id untouched)
             (b) a known alias exists -> reuse its id AND rename it to the standard
             (c) otherwise            -> create it
       */
      const groupRows = [];
      for (const nature of Object.keys(CHART)) {
        for (const [groupName] of CHART[nature]) {
          // (a) exact match
          if (groupIdByName[norm(groupName)] != null) {
            reusedGroups.push(groupName);
            continue;
          }
          // (b) alias match -> reuse the legacy group's id, rename it to standard
          const legacyHit = (GROUP_ALIASES[groupName] || []).find(
            (n) => groupIdByName[norm(n)] != null
          );
          if (legacyHit) {
            const gid = groupIdByName[norm(legacyHit)];
            groupIdByName[norm(groupName)] = gid; // so leaves resolve to it
            renamedGroups.push({ id: gid, from: legacyHit, to: groupName });
            continue;
          }
          // (c) create
          groupRows.push({
            ledger_group_no: nextGroupNo(),
            ledger_group_name: groupName,
            ledger_account_id: natureId[norm(nature)] ?? null,
            branch_id: 1,
            status_id: 1,
            created_at: now,
            updated_at: now,
          });
          createdGroups.push(groupName);
        }
      }

      // Apply alias renames (id preserved; only the display name changes).
      for (const r of renamedGroups) {
        await queryInterface.bulkUpdate(
          'ledger_group',
          { ledger_group_name: r.to, updated_at: now },
          { id: r.id },
          { transaction: t }
        );
      }

      if (groupRows.length) {
        await queryInterface.bulkInsert('ledger_group', groupRows, {
          transaction: t,
        });
        // Refresh so the just-created groups are resolvable for their ledgers.
        const refreshed = await select(
          `SELECT id, ledger_group_name
             FROM ledger_group WHERE deleted_at IS NULL ORDER BY id ASC`
        );
        refreshed.forEach((g) => {
          const k = norm(g.ledger_group_name);
          if (groupIdByName[k] == null) groupIdByName[k] = g.id;
        });
      }

      /* 4. Insert only the standard leaf ledgers missing under their group. */
      const existingLedgers = await select(
        `SELECT ledger_no, ledger_group_id, ledger_name
           FROM ledger WHERE deleted_at IS NULL`
      );
      const ledgerKey = new Set(
        existingLedgers.map((l) => `${l.ledger_group_id}::${norm(l.ledger_name)}`)
      );
      // Same reasoning as ledger_group_no: scan ALL rows (incl. soft-deleted) so a
      // new LAID#### can't collide with a soft-deleted ledger's code.
      const allLedgerNos = await select(`SELECT ledger_no FROM ledger`);
      const nextLedgerNo = makeNextNo(
        allLedgerNos.map((l) => l.ledger_no),
        'LAID'
      );

      const ledgerRows = [];
      for (const nature of Object.keys(CHART)) {
        for (const [groupName, leafNames] of CHART[nature]) {
          const gid = groupIdByName[norm(groupName)];
          if (gid == null) continue; // group unresolved (should not happen)
          for (const leafName of leafNames) {
            const key = `${gid}::${norm(leafName)}`;
            if (ledgerKey.has(key)) {
              skippedLedgers.push(`${leafName} (already under ${groupName})`);
              continue;
            }
            ledgerRows.push({
              ledger_no: nextLedgerNo(),
              ledger_group_id: gid,
              ledger_name: leafName,
              branch_id: 1,
              created_at: now,
              updated_at: now,
            });
            ledgerKey.add(key);
            createdLedgers.push(`${leafName} -> ${groupName}`);
          }
        }
      }
      if (ledgerRows.length) {
        await queryInterface.bulkInsert('ledger', ledgerRows, { transaction: t });
      }

      await t.commit();

      // eslint-disable-next-line no-console
      console.log(
        `[chart-sync] groups created: ${createdGroups.length}` +
          ` (${createdGroups.join(', ') || 'none'})\n` +
          `[chart-sync] groups renamed: ${renamedGroups.length}` +
          ` (${renamedGroups.map((r) => `${r.from} -> ${r.to}`).join(', ') || 'none'})\n` +
          `[chart-sync] groups reused:  ${reusedGroups.length}` +
          ` (${reusedGroups.join(', ') || 'none'})\n` +
          `[chart-sync] ledgers created: ${createdLedgers.length}\n` +
          `[chart-sync] ledgers skipped (already present): ${skippedLedgers.length}`
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  // Intentionally NON-destructive: this seeder inserts standard rows that may be
  // indistinguishable from pre-existing production rows of the same name, so an
  // automatic delete could remove real data. Roll back manually if ever needed.
  async down() {
    // eslint-disable-next-line no-console
    console.warn(
      '[chart-sync] down() is a no-op by design (additive production seeder). ' +
        'Remove any unwanted rows manually.'
    );
  },
};
