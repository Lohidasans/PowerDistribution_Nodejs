"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.bulkInsert(
      "bill_types",
      [
        {
          id: 1,
          bill_type: "Bill by bill",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 2,
          bill_type: "On Account",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 3,
          bill_type: "Advance",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 4,
          bill_type: "Others",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 5,
          bill_type: "Scheme",
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
