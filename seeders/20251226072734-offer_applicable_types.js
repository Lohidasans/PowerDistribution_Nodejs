'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('offer_applicable_types', [
      {
        id: 1,
        type_name: 'Material Type',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2,
        type_name: 'Category',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 3,
        type_name: 'Sub Category',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 4,
        type_name: 'Product',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 5,
        type_name: 'Making Charge',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 6,
        type_name: 'Wastage Charge',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('offer_applicable_types', {
      type_name: [
        'Material Type',
        'Category',
        'Sub Category',
        'Product',
        'Making Charge',
        'Wastage Charge'
      ]
    });
  }
};
