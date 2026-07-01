'use strict';

/**
 * Indexes to speed up the sales invoice list endpoint (GET /sales-invoice-bills).
 * - Header filtering by status / branch (+ soft-delete flag)
 * - Ordering by created_at
 * - Batched child lookups by foreign key (+ soft-delete flag)
 */
module.exports = {
  async up(queryInterface) {
    const indexes = [
      // sales_invoice_bills – list filters + ordering
      { table: 'sales_invoice_bills', fields: ['status', 'branch_id', 'deleted_at'], name: 'idx_sib_status_branch_deleted' },
      { table: 'sales_invoice_bills', fields: ['customer_id'], name: 'idx_sib_customer' },
      { table: 'sales_invoice_bills', fields: ['created_at'], name: 'idx_sib_created_at' },

      // sales_invoice_bill_items – batched IN (:ids) lookup
      { table: 'sales_invoice_bill_items', fields: ['invoice_bill_id', 'deleted_at'], name: 'idx_sibi_invoice_deleted' },

      // payments – batched IN (:ids) lookup
      { table: 'payments', fields: ['invoice_bill_id', 'deleted_at'], name: 'idx_payments_invoice_deleted' },

      // sales_invoice_adjustments – batched IN (:ids) lookup
      { table: 'sales_invoice_adjustments', fields: ['sales_invoice_id', 'deleted_at'], name: 'idx_sia_invoice_deleted' },
    ];

    for (const idx of indexes) {
      try {
        await queryInterface.addIndex(idx.table, idx.fields, { name: idx.name });
      } catch (e) { /* already exists */ }
    }
  },

  async down(queryInterface) {
    const drops = [
      { table: 'sales_invoice_bills', name: 'idx_sib_status_branch_deleted' },
      { table: 'sales_invoice_bills', name: 'idx_sib_customer' },
      { table: 'sales_invoice_bills', name: 'idx_sib_created_at' },
      { table: 'sales_invoice_bill_items', name: 'idx_sibi_invoice_deleted' },
      { table: 'payments', name: 'idx_payments_invoice_deleted' },
      { table: 'sales_invoice_adjustments', name: 'idx_sia_invoice_deleted' },
    ];

    for (const d of drops) {
      try {
        await queryInterface.removeIndex(d.table, d.name);
      } catch (e) { /* ignore */ }
    }
  },
};
