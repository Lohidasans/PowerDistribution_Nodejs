'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('purities', [
      {
        id: 1,
        purity_value: '80',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 2,      
        purity_value: '92.5',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 3,
        purity_value: '99.9',
        created_at: new Date(),
        updated_at: new Date(),
      },
      { 
        id: 4,
        purity_value: '91.75',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 5,
        purity_value: '100',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('purities', null, {});
  },
};
