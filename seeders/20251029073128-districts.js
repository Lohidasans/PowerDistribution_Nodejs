'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('districts', [
      { country_id: 1, state_id: 1, short_name: 'CHN', district_name: 'Chennai', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'CBE', district_name: 'Coimbatore', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'MDU', district_name: 'Madurai', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'TPR', district_name: 'Tirupur', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_id: 1, short_name: 'SLM', district_name: 'Salem', is_active: true, created_at: new Date(), updated_at: new Date() },
    ],
    { ignoreDuplicates: true } // prevents the unique constraint error
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('districts', null, {});
  }
};
