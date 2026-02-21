"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert(
      "charge_types",
      [
        {
          id: 1,
          name: "Additional Charges",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 2,
          name: "Delivery Charges",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 3,
          name: "Packing Charges",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 4,
          name: "Others",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("charge_types", null, {});
  },
};
