"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.bulkInsert(
      "bill_types",
      [
        {
          id: 1,
          bill_type: "Invoice",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 2,
          bill_type: "Salary",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 3,
          bill_type: "Purchase",
          created_at: new Date(),
          updated_at: new Date(),
        }
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.bulkDelete("bill_types", null, {});
  },
};
