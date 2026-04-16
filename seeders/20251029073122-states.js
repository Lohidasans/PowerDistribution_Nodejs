'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('states', [
      { country_id: 1, state_code: 'TN', state_name: 'Tamil Nadu', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_code: 'KA', state_name: 'Karnataka', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_code: 'KL', state_name: 'Kerala', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_code: 'MH', state_name: 'Maharashtra', is_active: true, created_at: new Date(), updated_at: new Date() },
      { country_id: 1, state_code: 'DL', state_name: 'Delhi', is_active: true, created_at: new Date(), updated_at: new Date() },
    ],
    { ignoreDuplicates: true } // prevents the unique constraint error
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('states', null, {});
  }
};
