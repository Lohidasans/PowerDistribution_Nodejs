// In seeders/20250106150000-leave-types.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('leave_types', [
      {
        leave_type_name: 'Emergency Leave',
        created_at: new Date('2025-11-11T06:42:20.922Z'),
        updated_at: new Date('2025-11-11T08:28:24.257Z')
      },
      {
        leave_type_name: 'Casual Leave',
        created_at: new Date('2025-11-11T06:45:41.949Z'),
        updated_at: new Date('2025-11-11T06:46:03.495Z')
      },
      {
        leave_type_name: 'Sick Leave',
        created_at: new Date('2025-11-11T06:48:10.917Z'),
        updated_at: new Date('2025-11-11T06:48:10.917Z')
      },
      {
        leave_type_name: 'Paid Leave',
        created_at: new Date('2025-11-11T06:48:18.729Z'),
        updated_at: new Date('2025-11-11T06:48:18.729Z')
      },
      {
        leave_type_name: 'Marriage Leave',
        created_at: new Date('2025-11-11T06:48:27.311Z'),
        updated_at: new Date('2025-11-11T06:48:27.311Z')
      },
      {
        leave_type_name: 'Half-Day Leave',
        created_at: new Date('2025-11-11T06:48:41.555Z'),
        updated_at: new Date('2025-11-11T06:48:41.555Z')
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('leave_types', null, {});
  }
};