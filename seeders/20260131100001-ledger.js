'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert(
      'ledger',
      [
        // Duties & Taxes (ledger_group_id = 12)
        { ledger_no: 'LAID001', ledger_name: 'OUTPUT IGST 0', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID002', ledger_name: 'OUTPUT IGST 5', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID003', ledger_name: 'OUTPUT IGST 12', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID004', ledger_name: 'OUTPUT IGST 18', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID005', ledger_name: 'OUTPUT IGST 28', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID006', ledger_name: 'INPUT IGST 0', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID007', ledger_name: 'INPUT IGST 5', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID008', ledger_name: 'INPUT IGST 12', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID009', ledger_name: 'INPUT IGST 18', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID010', ledger_name: 'INPUT IGST 28', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID011', ledger_name: 'OUTPUT CGST 0', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID012', ledger_name: 'OUTPUT SGST 0', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID013', ledger_name: 'OUTPUT CGST 2.5', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID014', ledger_name: 'OUTPUT SGST 2.5', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID015', ledger_name: 'OUTPUT CGST 6', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID016', ledger_name: 'OUTPUT SGST 6', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID017', ledger_name: 'OUTPUT CGST 9', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID018', ledger_name: 'OUTPUT SGST 9', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID019', ledger_name: 'OUTPUT CGST 14', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID020', ledger_name: 'OUTPUT SGST 14', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID021', ledger_name: 'INPUT CGST 0', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID022', ledger_name: 'INPUT SGST 0', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID023', ledger_name: 'INPUT CGST 2.5', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID024', ledger_name: 'INPUT SGST 2.5', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID025', ledger_name: 'INPUT CGST 6', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID026', ledger_name: 'INPUT SGST 6', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID027', ledger_name: 'INPUT CGST 9', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID028', ledger_name: 'INPUT SGST 9', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID029', ledger_name: 'INPUT CGST 14', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID030', ledger_name: 'INPUT SGST 14', ledger_group_id: 12, branch_id: 1,created_at: now, updated_at: now },

        // Indirect Incomes (ledger_group_id = 19)
        { ledger_no: 'LAID031', ledger_name: 'PURCHASE DISCOUNTS', ledger_group_id: 19, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID038', ledger_name: 'ROUNDED OFF', ledger_group_id: 19, branch_id: 1,created_at: now, updated_at: now },

        // Purchase Accounts (ledger_group_id = 29)
        { ledger_no: 'LAID032', ledger_name: 'PURCHASE ACCOUNTS', ledger_group_id: 29, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID033', ledger_name: 'PURCHASE LOCAL', ledger_group_id: 29,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID034', ledger_name: 'PURCHASE IMPORT', ledger_group_id: 29,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID041', ledger_name: 'Purchase Return', ledger_group_id: 29,branch_id: 1, created_at: now, updated_at: now },

        // Sales Accounts (ledger_group_id = 27)
        { ledger_no: 'LAID035', ledger_name: 'SALES ACCOUNTS', ledger_group_id: 27,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID042', ledger_name: 'Sales Returns', ledger_group_id: 27,branch_id: 1, created_at: now, updated_at: now },

        // Indirect Expenses (ledger_group_id = 28)
        { ledger_no: 'LAID036', ledger_name: 'ROUNDED OFF', ledger_group_id: 28, branch_id: 1,created_at: now, updated_at: now },
        { ledger_no: 'LAID037', ledger_name: 'SALES DISCOUNTS', ledger_group_id: 28,branch_id: 1, created_at: now, updated_at: now },

        // Cash In Hand (ledger_group_id = 26)
        { ledger_no: 'LAID039', ledger_name: 'CASH', ledger_group_id: 26,branch_id: 1, created_at: now, updated_at: now },

        // Current Liabilities (ledger_group_id = 10)
        { ledger_no: 'LAID040', ledger_name: 'Provision for Tax', ledger_group_id: 10,branch_id: 1, created_at: now, updated_at: now },

        // Duties & Taxes extra (ledger_group_id = 12)
        { ledger_no: 'LAID043', ledger_name: 'TCS', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },
        { ledger_no: 'LAID044', ledger_name: 'TCS', ledger_group_id: 12,branch_id: 1, created_at: now, updated_at: now },

        // Sundry Creditors (ledger_group_id = 13)
        { ledger_no: 'LAID045', ledger_name: 'Vendor accounts', ledger_group_id: 13,branch_id: 1, created_at: now, updated_at: now },

        // Sundry Debtors (ledger_group_id = 30)
        { ledger_no: 'LAID046', ledger_name: 'Customers', ledger_group_id: 30, branch_id: 1,created_at: now, updated_at: now },
      ],
      {}
    );
  },

  async down(queryInterface, Sequelize) {
    // safest rollback: delete only these codes
    await queryInterface.bulkDelete(
      'ledger',
      {
        ledger_no: [
          'LAID001','LAID002','LAID003','LAID004','LAID005','LAID006','LAID007','LAID008','LAID009','LAID010',
          'LAID011','LAID012','LAID013','LAID014','LAID015','LAID016','LAID017','LAID018','LAID019','LAID020',
          'LAID021','LAID022','LAID023','LAID024','LAID025','LAID026','LAID027','LAID028','LAID029','LAID030',
          'LAID031','LAID032','LAID033','LAID034','LAID035','LAID036','LAID037','LAID038','LAID039','LAID040',
          'LAID041','LAID042','LAID043','LAID044','LAID045','LAID046'
        ],
      },
      {}
    );
  },
};
