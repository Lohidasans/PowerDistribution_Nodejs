'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkUpdate(
      'ledger_group',
      { ledger_account_id: 1 }, // Asset
      {
        ledger_group_name: [
          'Non-Current Assets',
          'Accounts Receivable',
          'Investments',
          'Fixed Assets',
          'Current Assets',
          'Loans & Advances',
          'Stock in Hand',
          'Deposits',
          'Bank OCC Accounts',
          'Bank Accounts',
          'Cash In Hand',
          'Sundry Debtors'
        ]
      }
    );

    await queryInterface.bulkUpdate(
      'ledger_group',
      { ledger_account_id: 4 }, // Liability
      {
        ledger_group_name: [
          'Secured Loans',
          'Accounts Payable',
          'Current Liabilities',
          'Loan Liabilities',
          'Sundry Creditors'
        ]
      }
    );

    await queryInterface.bulkUpdate(
      'ledger_group',
      
      { ledger_account_id: 3 }, // Income
      {
        ledger_group_name: [
          'Direct Incomes',
          'Indirect Incomes',
          'Sales Accounts'
        ]
      }
    );

    await queryInterface.bulkUpdate(
      'ledger_group',
      { ledger_account_id: 2 }, // Expense
      {
        ledger_group_name: [
          'Direct Expenses',
          'Indirect Expenses',
          'Purchase Accounts',
          'Duties & Taxes'
        ]
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkUpdate(
      'ledger_group',
      { ledger_account_id: null },
      {}
    );
  }
};