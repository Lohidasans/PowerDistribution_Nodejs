"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("roles", [
      {
        id: 1,
        department_id: 1,
        role_name: "Branch Admin",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      "roles",
      {
        id: 1,
      },
      {}
    );
  },
};