'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('districts', [
      { country_id: 1, state_id: 1, short_name: 'CHN', district_name: 'Chennai', created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'CBE', district_name: 'Coimbatore', created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'MDU', district_name: 'Madurai', created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'TPR', district_name: 'Tirupur', created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'SLM', district_name: 'Salem', created_at: new Date(), updated_at: new Date() },
    ],
    { ignoreDuplicates: true } // prevents the unique constraint error
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('districts', null, {});
  }
};
