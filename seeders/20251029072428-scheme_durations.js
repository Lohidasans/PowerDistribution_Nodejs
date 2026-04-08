'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('scheme_durations', [
      {
        duration_name: '6 Months',
        months: 6,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        duration_name: '12 Months',
        months: 12,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('scheme_durations', {
      duration_name: ['6 Months', '12 Months']
    });
  }
};