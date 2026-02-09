'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Additional test data with employees having MULTIPLE clock in/out events
        // seq_number: 1, 2, 3, 4, etc. to demonstrate break hours

        const trackingData = [
            // Employee 11: Multiple breaks throughout the day
            // Clock in: 09:00, Out: 12:00 (lunch), In: 13:00, Out: 15:00 (break), In: 15:30, Out: 18:00
            // Total: 9h, Production: 7.5h, Break: 1.5h
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-09', time: '12:00:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-09', time: '15:00:00', device_id: 'CJ_DEV_001', seq_number: 4 },
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-09', time: '15:30:00', device_id: 'CJ_DEV_001', seq_number: 5 },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: 6 },

            // Employee 12: Lunch break only
            // Clock in: 09:00, Out: 13:00 (lunch), In: 14:00, Out: 18:00
            // Total: 9h, Production: 8h, Break: 1h
            { ref_employee_id: 1211, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1211, status_id: 2, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1211, status_id: 1, date: '2026-02-09', time: '14:00:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1211, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: 4 },

            // Employee 13: Short break + Overtime
            // Clock in: 09:00, Out: 12:30, In: 13:00, Out: 19:30
            // Total: 10h, Production: 9h, Break: 0.5h, Overtime: 1.5h
            { ref_employee_id: 1212, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1212, status_id: 2, date: '2026-02-09', time: '12:30:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1212, status_id: 1, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1212, status_id: 2, date: '2026-02-09', time: '19:30:00', device_id: 'CJ_DEV_001', seq_number: 4 },

            // Employee 14: Late arrival + Multiple breaks
            // Clock in: 10:00 (1h late), Out: 12:00, In: 13:00, Out: 15:00, In: 15:15, Out: 20:00
            // Total: 10h, Production: 8h, Break: 1h 15m, Overtime: 2h, Late: 1h
            { ref_employee_id: 1213, status_id: 1, date: '2026-02-09', time: '10:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1213, status_id: 2, date: '2026-02-09', time: '12:00:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1213, status_id: 1, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1213, status_id: 2, date: '2026-02-09', time: '15:00:00', device_id: 'CJ_DEV_001', seq_number: 4 },
            { ref_employee_id: 1213, status_id: 1, date: '2026-02-09', time: '15:15:00', device_id: 'CJ_DEV_001', seq_number: 5 },
            { ref_employee_id: 1213, status_id: 2, date: '2026-02-09', time: '20:00:00', device_id: 'CJ_DEV_001', seq_number: 6 },

            // Employee 15: Very long lunch break
            // Clock in: 09:00, Out: 12:00, In: 15:00 (3h lunch!), Out: 18:00
            // Total: 9h, Production: 6h, Break: 3h
            { ref_employee_id: 1214, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1214, status_id: 2, date: '2026-02-09', time: '12:00:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1214, status_id: 1, date: '2026-02-09', time: '15:00:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1214, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: 4 },

            // Employee 16: Multiple short breaks
            // Clock in: 09:00, Out: 10:30, In: 10:45, Out: 12:00, In: 13:00, Out: 14:30, In: 14:45, Out: 18:00
            // Total: 9h, Production: 7.5h, Break: 1.5h
            { ref_employee_id: 1215, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1215, status_id: 2, date: '2026-02-09', time: '10:30:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1215, status_id: 1, date: '2026-02-09', time: '10:45:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1215, status_id: 2, date: '2026-02-09', time: '12:00:00', device_id: 'CJ_DEV_001', seq_number: 4 },
            { ref_employee_id: 1215, status_id: 1, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: 5 },
            { ref_employee_id: 1215, status_id: 2, date: '2026-02-09', time: '14:30:00', device_id: 'CJ_DEV_001', seq_number: 6 },
            { ref_employee_id: 1215, status_id: 1, date: '2026-02-09', time: '14:45:00', device_id: 'CJ_DEV_001', seq_number: 7 },
            { ref_employee_id: 1215, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: 8 },

            // Historical data with breaks
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-08', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-08', time: '12:30:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-08', time: '13:30:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-08', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: 4 },

            { ref_employee_id: 1211, status_id: 1, date: '2026-02-08', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: 1 },
            { ref_employee_id: 1211, status_id: 2, date: '2026-02-08', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: 2 },
            { ref_employee_id: 1211, status_id: 1, date: '2026-02-08', time: '14:00:00', device_id: 'CJ_DEV_001', seq_number: 3 },
            { ref_employee_id: 1211, status_id: 2, date: '2026-02-08', time: '19:00:00', device_id: 'CJ_DEV_001', seq_number: 4 },
        ];

        // Add timestamps
        const now = new Date();
        const dataWithTimestamps = trackingData.map(record => ({
            ...record,
            created_at: now,
            updated_at: now,
            deleted_at: null
        }));

        await queryInterface.bulkInsert('employee_tracking', dataWithTimestamps, {});
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.bulkDelete('employee_tracking', {
            ref_employee_id: {
                [Sequelize.Op.in]: [1210, 1211, 1212, 1213, 1214, 1215]
            }
        }, {});
    }
};
