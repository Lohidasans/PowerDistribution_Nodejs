// In seeders/20250106160000-bill-adjustment-types.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('bill_adjustment_types', [
      {
        type_name: 'Sales Return',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        type_name: 'Old Jewel',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        type_name: 'Saving Scheme',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('bill_adjustment_types', null, {});
  }
};