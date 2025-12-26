'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('purchase_order_items', [
      {
        id:1,
        po_id: 1,
        material_type_id: 1,   // Gold
        category_id: 1,        // Earrings
        subcategory_id: 1,     // Stud
        description: 'Silver Ring',
        purity: 99.9,
        ordered_weight: 50.000,
        quantity: 50,
        rate: 110.00,
        amount: 10000.00,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2,
        po_id: 1,
        material_type_id: 1,
        category_id: 1,
        subcategory_id: 1,
        description: 'Additional Item',
        purity: 99.9,
        ordered_weight: 0,
        quantity: 0,
        rate: 0,
        amount: 0,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 3,
        po_id: 2,
        material_type_id: 1,
        category_id: 1,
        subcategory_id: 1,
        description: 'Additional Item',
        purity: 99.9,
        ordered_weight: 0,
        quantity: 0,
        rate: 0,
        amount: 0,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('purchase_order_items', {
      po_id: 1
    });
  }
};
