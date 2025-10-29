'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('redemption_types', [
      { type_name: 'Jewellery', created_at: new Date(), updated_at: new Date() },
      { type_name: 'Coins', created_at: new Date(), updated_at: new Date() },
      { type_name: 'Bars', created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('redemption_types', null, {});
  }
};
