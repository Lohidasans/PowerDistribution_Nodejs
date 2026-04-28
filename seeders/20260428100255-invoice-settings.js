'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('invoice_settings', [
      {
        id: 1,
        branch_id: 1,
        invoice_sequence_name_id: 1,
        invoice_prefix: 'EST',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 2,
        branch_id: 1,
        invoice_sequence_name_id: 2,
        invoice_prefix: 'INV',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 3,
        branch_id: 1,
        invoice_sequence_name_id: 3,
        invoice_prefix: 'SR',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 4,
        branch_id: 1,
        invoice_sequence_name_id: 4,
        invoice_prefix: 'OJ',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 5,
        branch_id: 1,
        invoice_sequence_name_id: 5,
        invoice_prefix: 'JR',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 6,
        branch_id: 1,
        invoice_sequence_name_id: 6,
        invoice_prefix: 'PAY',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 7,
        branch_id: 1,
        invoice_sequence_name_id: 7,
        invoice_prefix: 'REC',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 8,
        branch_id: 1,
        invoice_sequence_name_id: 8,
        invoice_prefix: 'JRE',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      },
      {
        id: 9,
        branch_id: 1,
        invoice_sequence_name_id: 9,
        invoice_prefix: 'GRN',
        invoice_suffix: '26-27',
        status_id: 1,
        invoice_start_no: 0,
        created_at: new Date('2026-04-28 08:48:01.345'),
        updated_at: new Date('2026-04-28 08:48:01.345'),
        deleted_at: null
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('invoice_settings', {
      id: [1, 2, 3, 4, 5, 6, 7, 8, 9]
    }, {});
  }
};