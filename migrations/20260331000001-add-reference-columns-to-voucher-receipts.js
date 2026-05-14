"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("voucher_receipts");

    if (!tableDescription.reference_type) {
      await queryInterface.addColumn("voucher_receipts", "reference_type", {
        type: Sequelize.STRING(20),
        allowNull: true,
        after: "transaction_no",
      });
    }

    if (!tableDescription.reference_id) {
      await queryInterface.addColumn("voucher_receipts", "reference_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: "reference_type",
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("voucher_receipts");

    if (tableDescription.reference_id) {
      await queryInterface.removeColumn("voucher_receipts", "reference_id");
    }

    if (tableDescription.reference_type) {
      await queryInterface.removeColumn("voucher_receipts", "reference_type");
    }
  },
};
