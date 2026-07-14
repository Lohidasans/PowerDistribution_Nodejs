"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("employee_departments", [
      {
        id: 1,
        department_name: "Admin",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      "employee_departments",
      {
        id: 1,
      },
      {}
    );
  },
};