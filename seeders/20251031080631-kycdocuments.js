"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("kycDocuments", [
      {
        entity_type: "superadmin",
        entity_id: 1,
        doc_type: "PAN Card",
        doc_number: "GJYPP9702G",
        file_url: "uploads/kyc/pan_card.pdf",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        entity_type: "superadmin",
        entity_id: 1,
        doc_type: "GST",
        doc_number: "33GJYPP9702G1ZP",
        file_url: "uploads/kyc/gst_certificate.pdf",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        entity_type: "superadmin",
        entity_id: 1,
        doc_type: "MSME",
        doc_number: "MSME12345TN",
        file_url: "uploads/kyc/msme_certificate.pdf",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        entity_type: "branch",
        entity_id: 1,
        doc_type: "PAN Card",
        doc_number: "ABCDE1234F",
        file_url: "uploads/kyc/branch_pan.pdf",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        entity_type: "branch",
        entity_id: 1,
        doc_type: "GST",
        doc_number: "33ABCDE1234F1ZP",
        file_url: "uploads/kyc/branch_gst.pdf",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("kycDocuments", {
      entity_type: {
        [Sequelize.Op.in]: ["superadmin", "branch"],
      },
    });
  },
};
