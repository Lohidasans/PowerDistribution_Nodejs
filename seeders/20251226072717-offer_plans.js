'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('offer_plans', [
      {
        id: 1,
        plan_name: 'Direct Offer',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id:2,
        plan_name: 'Conditional Offer',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('offer_plans', {
      name: ['Direct Offer', 'Conditional Offer']
    });
  }
};
