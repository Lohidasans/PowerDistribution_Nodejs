"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert(
      "maintenance_types",
      [
        {
          id: 1,
          type_name: "General",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 2,
          type_name: "Periodic",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 3,
          type_name: "Preventive",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 4,
          type_name: "Corrective",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      "maintenance_types",
      {
        type_name: [
          "General",
          "Periodic",
          "Preventive",
          "Corrective",
        ],
      },
      {}
    );
  },
};
