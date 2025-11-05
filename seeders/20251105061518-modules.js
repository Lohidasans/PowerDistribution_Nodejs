"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("modules", [
      // === moduleGroup: 1 (General) ===
      {
        module_group_id: 1,
        module_name: "Dashboard",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Customer",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Saving Scheme",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Stock Management",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Branch",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Vendor",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Sales Management",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Asset Management",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Journal Entry",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 1,
        module_name: "Voucher",
        created_at: new Date(),
        updated_at: new Date(),
      },

      // === moduleGroup: 2 (Master) ===
      {
        module_group_id: 2,
        module_name: "Branch",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Vendor",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Employee",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Collection",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "UOM",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Products",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Accounts",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Tag Printing",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Offers",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 2,
        module_name: "Saving Scheme",
        created_at: new Date(),
        updated_at: new Date(),
      },

      // === moduleGroup: 3 (Purchase Management) ===
      {
        module_group_id: 3,
        module_name: "Quotation",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 3,
        module_name: "Purchase",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 3,
        module_name: "GRN",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 3,
        module_name: "Purchase Return",
        created_at: new Date(),
        updated_at: new Date(),
      },

      // === moduleGroup: 4 (HR Management) ===
      {
        module_group_id: 4,
        module_name: "Employee",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 4,
        module_name: "Attendance",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 4,
        module_name: "Leave",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 4,
        module_name: "Holidays",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        module_group_id: 4,
        module_name: "Payroll",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("modules", null, {});
  },
};
