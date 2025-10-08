"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Insert data
    return queryInterface.bulkInsert("permissions", [
      { permission_name: "Dashboard", created_at: new Date(), updated_at: new Date() },
      { permission_name: "Customer", created_at: new Date(), updated_at: new Date() },
      { permission_name: "Role Access", created_at: new Date(), updated_at: new Date() },
      { permission_name: "Subscription", created_at: new Date(), updated_at: new Date() },
      { permission_name: "Finance Matters", created_at: new Date(), updated_at: new Date() },
      { permission_name: "User Manual", created_at: new Date(), updated_at: new Date() },
      { permission_name: "Role Access", created_at: new Date(), updated_at: new Date() },
      { permission_name: "Reports", created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    // Rollback (Delete inserted records)
    return queryInterface.bulkDelete("permissions", null, {});
  },
};
