"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("employee_departments", [
      {
        department_name: "Sales",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        department_name: "Billing",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        department_name: "Inventory",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        department_name: "Support",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        department_name: "Administration",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("employee_departments", null, {});
  },
};
