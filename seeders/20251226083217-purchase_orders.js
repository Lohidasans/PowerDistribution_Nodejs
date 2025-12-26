'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('purchase_orders', [
      {
        id: 1,
        po_no: 'PO001',
        po_date: '2025-05-19',
        vendor_id: 1,
        order_by_user_id: 1,
        gst_no: '33AADFT0604Q1Z6',
        billing_address: '18, Vaniet Street, George Town, Chennai - 600001',
        shipping_address: '18, Vaniet Street, George Town, Chennai - 600001',
        subtotal_amount: 10075.00,
        sgst_percent: 0.00,
        cgst_percent: 2.00,
        discount_percent: 0.00,
        remarks: 'Sample purchase order remarks',
        status_id: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2,
        po_no: 'PO002',
        po_date: '2025-05-12',
        vendor_id: 2,
        order_by_user_id: 2,
        gst_no: '43AADFT0604Q1Z6',
        billing_address: 'Daniel Street, George Town, Chennai - 600008',
        shipping_address: 'Daniel Street, George Town, Chennai - 600001',
        subtotal_amount: 10075.00,
        sgst_percent: 0.00,
        cgst_percent: 2.00,
        discount_percent: 0.00,
        remarks: 'Sample purchase order remarks',
        status_id: 1,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('purchase_orders', {
      po_no: 'PO001'
    });
  }
};
