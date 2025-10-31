"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("bankAccounts", [
      {
        entity_type: "superadmin",
        entity_id: 1, // Refers to the superadmin profile above
        account_holder_name: "Karthi Kumar",
        bank_name: "State Bank of India",
        ifsc_code: "SBIN0001849",
        account_number: "998856565520",
        bank_branch_name: "RS Puram",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("bankAccounts", { entity_type: "superadmin" });
  },
};
