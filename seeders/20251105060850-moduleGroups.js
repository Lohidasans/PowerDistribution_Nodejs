"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("module_groups", [
      {
        id: 1,
        module_group_name: "General",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 2,
        module_group_name: "Master",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 3,
        module_group_name: "Purchase Management",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 4,
        module_group_name: "HR Management",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("module_groups", null, {});
  },
};
