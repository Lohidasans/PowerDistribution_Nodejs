"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
      await queryInterface.bulkInsert("users", [
      {
        entity_type: "superadmin",
        entity_id: 1,
        email: "kumar@gmail.com",
        password_hash: "Password@123",
        role_id: 1, // Example: SuperAdmin role
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("users", { entity_type: "superadmin" });
  },
};
