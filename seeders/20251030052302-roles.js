'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert('roles', [
      { role_name: 'Super Admin', department_id: 5, created_at: now, updated_at: now },
      { role_name: 'Branch Admin', department_id: 5, created_at: now, updated_at: now },
      { role_name: 'HR Manager', department_id: 5, created_at: now, updated_at: now },
      { role_name: 'Sales Head', department_id: 1, created_at: now, updated_at: now },
      { role_name: 'Sales Person', department_id: 1, created_at: now, updated_at: now },
      { role_name: 'Finance Head', department_id: 2, created_at: now, updated_at: now },
      { role_name: 'Inventory Manager', department_id: 2, created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('roles', null, {});
  },
};
