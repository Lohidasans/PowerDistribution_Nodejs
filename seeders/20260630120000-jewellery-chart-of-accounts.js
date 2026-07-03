'use strict';

/**
 * Jewellery Chart of Accounts — full reseed (matches the chart-of-accounts image).
 *
 * Hierarchy (3 levels, matching the existing schema):
 *   ledger_accounts  -> Nature   (Asset / Liability / Income / Expense, with normal_balance)
 *     ledger_group   -> Group    (e.g. Current Assets, Sales Accounts)   FK ledger_account_id
 *       ledger       -> Account  (e.g. Cash in Hand, Gold Sales)         FK ledger_group_id
 *
 * Why this seeder exists:
 *   The older ledger seeders hard-coded auto-increment FK ids (ledger_group_id = 12, 27, 29 ...)
 *   which drift out of alignment whenever rows are added/removed -> ledgers landed under the
 *   wrong group. This seeder NEVER hard-codes a foreign key: every ledger_account_id and
 *   ledger_group_id is resolved BY NAME at run time, and ledger_group_no / ledger_no are
 *   generated sequentially. Re-running it always produces the same, correct result.
 *
 * Strategy: WIPE & RESEED EXACTLY.
 *   TRUNCATE ledger + ledger_group (RESTART IDENTITY) then insert the full chart fresh, so the
 *   result is a 1:1 match with the image. CASCADE is used so the truncate also clears any rows
 *   that reference these tables (e.g. vouchers) — intended for a dev/demo database only.
 */

// nature => [ [groupName, [...ledgerNames]] ]
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
    // Sundry Debtors is kept as a GROUP (not a leaf ledger): customerService
    // creates one ledger per customer under this group at runtime. Leaving the
    // ledger list empty is intentional.
    ['Sundry Debtors', []],
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
    // Sundry Creditors is kept as a GROUP (not a leaf ledger): vendorService
    // creates one ledger per vendor under this group at runtime. Leaving the
    // ledger list empty is intentional.
    ['Sundry Creditors', []],
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
      'Round Off', // rounding GAIN (sale collected more / purchase paid less)
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
      'Round Off', // rounding LOSS (sale collected less / purchase paid more)
    ]],
  ],
};

// Nature -> normal_balance, used only when a nature row is missing and has to be created.
const NATURE_BALANCE = {
  Asset: 'Debit',
  Liability: 'Credit',
  Income: 'Credit',
  Expense: 'Debit',
};

const pad3 = (n) => String(n).padStart(3, '0');

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const now = new Date();
    const select = (sql) =>
      sequelize.query(sql, { type: Sequelize.QueryTypes.SELECT });

    /* -----------------------------------------------------------------
       1. Wipe the existing chart (dev/demo reseed).
       ----------------------------------------------------------------- */
    // One statement so the ledger -> ledger_group FK never blocks the truncate;
    // CASCADE also clears anything referencing these tables (e.g. vouchers).
    await sequelize.query(
      'TRUNCATE TABLE ledger, ledger_group RESTART IDENTITY CASCADE;'
    );

    /* -----------------------------------------------------------------
       2. Resolve (or create) the 4 natures in ledger_accounts.
       ----------------------------------------------------------------- */
    const existingNatures = await select(
      `SELECT id, account_name FROM ledger_accounts WHERE deleted_at IS NULL`
    );
    const natureId = {};
    existingNatures.forEach((r) => {
      natureId[r.account_name.toLowerCase()] = r.id;
    });

    const missingNatures = Object.keys(CHART)
      .filter((n) => natureId[n.toLowerCase()] == null)
      .map((n) => ({
        account_name: n,
        normal_balance: NATURE_BALANCE[n],
        status_id: 1,
        created_at: now,
        updated_at: now,
      }));

    if (missingNatures.length) {
      await queryInterface.bulkInsert('ledger_accounts', missingNatures, {});
      const refreshed = await select(
        `SELECT id, account_name FROM ledger_accounts WHERE deleted_at IS NULL`
      );
      refreshed.forEach((r) => {
        natureId[r.account_name.toLowerCase()] = r.id;
      });
    }

    /* -----------------------------------------------------------------
       3. Insert all groups (ledger_account_id resolved by nature name).
       ----------------------------------------------------------------- */
    const groupRows = [];
    let g = 0;
    for (const nature of Object.keys(CHART)) {
      for (const [groupName] of CHART[nature]) {
        groupRows.push({
          ledger_group_no: `LGID${pad3(++g)}`,
          ledger_group_name: groupName,
          ledger_account_id: natureId[nature.toLowerCase()],
          branch_id: 1,
          status_id: 1,
          created_at: now,
          updated_at: now,
        });
      }
    }
    await queryInterface.bulkInsert('ledger_group', groupRows, {});

    /* -----------------------------------------------------------------
       4. Insert all ledgers (ledger_group_id resolved by group name).
       ----------------------------------------------------------------- */
    const groups = await select(
      `SELECT id, ledger_group_name FROM ledger_group WHERE deleted_at IS NULL`
    );
    const groupId = {};
    groups.forEach((r) => {
      groupId[r.ledger_group_name.toLowerCase()] = r.id;
    });

    const ledgerRows = [];
    let l = 0;
    for (const nature of Object.keys(CHART)) {
      for (const [groupName, ledgerNames] of CHART[nature]) {
        const gid = groupId[groupName.toLowerCase()];
        for (const ledgerName of ledgerNames) {
          ledgerRows.push({
            ledger_no: `LAID${pad3(++l)}`,
            ledger_group_id: gid,
            ledger_name: ledgerName,
            branch_id: 1,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }
    await queryInterface.bulkInsert('ledger', ledgerRows, {});
  },

  async down(queryInterface) {
    // Reverse: clear the chart that this seeder created.
    await queryInterface.sequelize.query(
      'TRUNCATE TABLE ledger, ledger_group RESTART IDENTITY CASCADE;'
    );
  },
};
