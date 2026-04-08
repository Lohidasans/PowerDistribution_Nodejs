'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert(
      'ledger_group',
      [
        {
          ledger_group_no: 'LGID001',
          ledger_group_name: 'Secured Loans',
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID002',
          ledger_group_name: 'Non-Current Assets',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID003',
          ledger_group_name: 'Accounts Receivable',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID004',
          ledger_group_name: 'Accounts Payable',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID005',
          ledger_group_name: 'Capital Account',
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID006',
          ledger_group_name: 'Current Liabilities',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID007',
          ledger_group_name: 'Loan Liabilities',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID008',
          ledger_group_name: 'Duties & Taxes',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID009',
          ledger_group_name: 'Sundry Creditors',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID010',
          ledger_group_name: 'Investments',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID011',
          ledger_group_name: 'Branch / Division',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID012',
          ledger_group_name: 'Fixed Assets',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID013',
          ledger_group_name: 'Current Assets',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID014',
          ledger_group_name: 'Direct Incomes',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID015',
          ledger_group_name: 'Indirect Incomes',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID016',
          ledger_group_name: 'Loans & Advances',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID017',
          ledger_group_name: 'Stock in Hand',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID018',
          ledger_group_name: 'Deposits',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID019',
          ledger_group_name: 'Direct Expenses',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID020',
          ledger_group_name: 'Bank OCC Accounts',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID021',
          ledger_group_name: 'Bank Accounts',
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID022',
          ledger_group_name: 'Cash In Hand',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID023',
          ledger_group_name: 'Sales Accounts',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID024',
          ledger_group_name: 'Indirect Expenses',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID025',
          ledger_group_name: 'Purchase Accounts',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          ledger_group_no: 'LGID026',
          ledger_group_name: 'Sundry Debtors',          
          status_id: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ledger_group', null, {});
  },
};
