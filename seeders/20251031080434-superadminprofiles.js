"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("superadmin_profiles", [
      {
        company_name: "Chaneira Jewels",
        proprietor: "Karthi",
        mobile_number: "9889899587",
        email_id: "karthi123@gmail.com",
        address: "74/1, W. Ponnusamy Rd, RS Puram",
        district_id: 2, // Assuming '1' exists in districts table
        state_id: 1,   // Tamil Nadu (example ID)
        pin_code: "641002",
        branch_sequence_type: "prefix",
        branch_sequence_value: "CJ",
        joining_date: "2024-01-01",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("superadmin_profiles", null, {});
  },
};
