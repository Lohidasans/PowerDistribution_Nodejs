"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("payrolls");

    if (!tableDescription.payment_mode) {
      await queryInterface.addColumn("payrolls", "payment_mode", {
        type: Sequelize.STRING(50),
        allowNull: true,
        after: "net_salary",
      });
    }

    if (!tableDescription.payment_no) {
      await queryInterface.addColumn("payrolls", "payment_no", {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: "payment_mode",
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("payrolls");

    if (tableDescription.payment_no) {
      await queryInterface.removeColumn("payrolls", "payment_no");
    }

    if (tableDescription.payment_mode) {
      await queryInterface.removeColumn("payrolls", "payment_mode");
    }
  },
};
