'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('ledger_accounts', [
      {
        account_name: 'Asset',
        normal_balance: 'Debit',
        status_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        account_name: 'Expense',
        normal_balance: 'Debit',
        status_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        account_name: 'Income',
        normal_balance: 'Credit',
        status_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        account_name: 'Liability',
        normal_balance: 'Credit',
        status_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('ledger_accounts', {
      account_name: ['Asset', 'Expense', 'Income', 'Liability']
    }, {});
  }
};