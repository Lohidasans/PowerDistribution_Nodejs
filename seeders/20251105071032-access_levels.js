"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.bulkInsert("access_levels", [
      {
        id: 1,
        access_name: "Full Access",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 2,
        access_name: "View Only",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 3,
        access_name: "Edit Only",
        created_at: new Date(),
        updated_at: new Date(),
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.bulkDelete("access_levels", null, {});
  }
};
