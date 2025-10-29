'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('payment_frequencies', [
      { frequency_name: 'Monthly', created_at: new Date(), updated_at: new Date() },
      { frequency_name: 'Half Yearly', created_at: new Date(), updated_at: new Date() },
      { frequency_name: 'Quarterly Yearly', created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('payment_frequencies', null, {});
  }
};
