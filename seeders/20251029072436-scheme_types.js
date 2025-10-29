'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('scheme_types', [
      { type_name: 'Weight Based', created_at: new Date(), updated_at: new Date() },
      { type_name: 'Value Based', created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('scheme_types', null, {});
  }
};
