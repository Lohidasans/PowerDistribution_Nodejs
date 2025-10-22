"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("employee_designations", [
      {
        designation_name: "Sales Executive",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        designation_name: "Store Manager",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        designation_name: "Cashier",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        designation_name: "Inventory Controller",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        designation_name: "Customer Support",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("employee_designations", null, {});
  },
};
