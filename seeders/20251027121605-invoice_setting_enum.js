"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("invoice_setting_enum", [
      {
        invoice_setting_enum: "Estimate",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "Sales Invoice",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "Sales Return",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "Old Jewel",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "Jewel Repair",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "Payment",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "Receipt",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "Journal Entry",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        invoice_setting_enum: "GRN",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("invoice_setting_enum", null, {});
  },
};
