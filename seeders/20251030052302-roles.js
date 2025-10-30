'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert('roles', [
      { role_name: 'Super Admin', created_at: now, updated_at: now },
      { role_name: 'Branch Admin', created_at: now, updated_at: now },
      { role_name: 'HR Manager', created_at: now, updated_at: now },
      { role_name: 'Sales Head', created_at: now, updated_at: now },
      { role_name: 'Sales Person', created_at: now, updated_at: now },
      { role_name: 'Finance Head', created_at: now, updated_at: now },
      { role_name: 'Inventory Manager', created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('roles', null, {});
  },
};
