"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.bulkInsert(
      "payment_modes",
      [
        { id: 1, payment_mode: "Cash", created_at: new Date(), updated_at: new Date() },
        { id: 2, payment_mode: "Card", created_at: new Date(), updated_at: new Date() },
        { id: 3, payment_mode: "Bank Transfer", created_at: new Date(), updated_at: new Date() },
        { id: 4, payment_mode: "Cheque", created_at: new Date(), updated_at: new Date() },
        { id: 5, payment_mode: "UPI", created_at: new Date(), updated_at: new Date() },
        { id: 6, payment_mode: "Other", created_at: new Date(), updated_at: new Date() },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.bulkDelete("payment_modes", null, {});
  },
};
