"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("branches", [
      {
        id: 1,
        branch_no: "HO",
        branch_name: "Head Office",
        contact_person: "Branch Manager",
        mobile: "9876543210",
        email: "branch@ho.com",
        address: "RS Puram, Coimbatore, Tamil Nadu",
        district_id: 2,
        state_id: 1,   
        pin_code: "600040",
        gst_no: "33ABCDE1234F1ZP",
        signature_url: "uploads/signatures/branch_sign.png",
        status: "Active",
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("branches", {
      id: 1,
    });
  },
};
