"use strict";
const bcrypt = require("bcrypt");

module.exports = {
  async up(queryInterface, Sequelize) {
    // Hash passwords before inserting
    const hashedPassword1 = await bcrypt.hash("Password@123", 10);
    const hashedPassword2 = await bcrypt.hash("Password@1234", 10);

    await queryInterface.bulkInsert("users", [
      {
        entity_type: "superadmin",
        entity_id: 1,
        email: "kumar@gmail.com",
        password_hash: hashedPassword1,
        role_id: 1, // SuperAdmin role
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        entity_type: "branch",
        entity_id: 1,
        email: "branchadmin@chaneira.com",
        password_hash: hashedPassword2,
        role_id: 2, // Branch Admin role
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("users", {
      entity_type: {
        [Sequelize.Op.in]: ["superadmin", "branch"],
      },
    });
  },
};
