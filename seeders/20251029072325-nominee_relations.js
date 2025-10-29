'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('relations', [
      { relation_name: 'Father', created_at: new Date(), updated_at: new Date() },
      { relation_name: 'Mother', created_at: new Date(), updated_at: new Date() },
      { relation_name: 'Brother', created_at: new Date(), updated_at: new Date() },
      { relation_name: 'Sister', created_at: new Date(), updated_at: new Date() },
      { relation_name: 'Spouse', created_at: new Date(), updated_at: new Date() },
      { relation_name: 'Son', created_at: new Date(), updated_at: new Date() },
      { relation_name: 'Daughter', created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('relations', null, {});
  }
};
