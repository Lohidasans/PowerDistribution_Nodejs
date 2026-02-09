'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Employee tracking data with GLOBALLY UNIQUE seq_number
        // Each seq_number appears only ONCE in the entire table

        let seqCounter = 1; // Global sequence counter
        const trackingData = [];

        // Employee 1: Bessie Cooper (1200) - Perfect attendance
        trackingData.push(
            { ref_employee_id: 1200, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1200, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 2: Devon Lane (1201) - Late + Overtime
        trackingData.push(
            { ref_employee_id: 1201, status_id: 1, date: '2026-02-09', time: '09:15:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1201, status_id: 2, date: '2026-02-09', time: '19:15:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 3: Albert Flores (1202) - Early arrival + Small OT
        trackingData.push(
            { ref_employee_id: 1202, status_id: 1, date: '2026-02-09', time: '08:45:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1202, status_id: 2, date: '2026-02-09', time: '18:20:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 4: Eleanor Pena (1203) - Absent

        // Employee 5: Leslie Alexander (1204) - Very late + Overtime
        trackingData.push(
            { ref_employee_id: 1204, status_id: 1, date: '2026-02-09', time: '10:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1204, status_id: 2, date: '2026-02-09', time: '20:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 6: Jenny Wilson (1205) - Half day
        trackingData.push(
            { ref_employee_id: 1205, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1205, status_id: 2, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 7: Cody Fisher (1206) - Late + Early departure
        trackingData.push(
            { ref_employee_id: 1206, status_id: 1, date: '2026-02-09', time: '09:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1206, status_id: 2, date: '2026-02-09', time: '17:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 8: Darlene Robertson (1207) - Absent

        // Employee 9: Jerome Bell (1208) - Massive overtime
        trackingData.push(
            { ref_employee_id: 1208, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1208, status_id: 2, date: '2026-02-09', time: '21:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 10: Floyd Miles (1209) - Very early arrival
        trackingData.push(
            { ref_employee_id: 1209, status_id: 1, date: '2026-02-09', time: '07:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1209, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 11: Multiple breaks - seq_number continues globally
        trackingData.push(
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-09', time: '12:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-09', time: '15:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-09', time: '15:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 12: Lunch break only
        trackingData.push(
            { ref_employee_id: 1211, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1211, status_id: 2, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1211, status_id: 1, date: '2026-02-09', time: '14:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1211, status_id: 2, date: '2026-02-09', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Employee 13: Short break + Overtime
        trackingData.push(
            { ref_employee_id: 1212, status_id: 1, date: '2026-02-09', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1212, status_id: 2, date: '2026-02-09', time: '12:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1212, status_id: 1, date: '2026-02-09', time: '13:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1212, status_id: 2, date: '2026-02-09', time: '19:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

        // Historical data - seq_number continues globally
        trackingData.push(
            { ref_employee_id: 1200, status_id: 1, date: '2026-02-08', time: '09:05:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1200, status_id: 2, date: '2026-02-08', time: '18:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },

            { ref_employee_id: 1200, status_id: 1, date: '2026-02-07', time: '08:55:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1200, status_id: 2, date: '2026-02-07', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },

            { ref_employee_id: 1201, status_id: 1, date: '2026-02-08', time: '09:20:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1201, status_id: 2, date: '2026-02-08', time: '19:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },

            { ref_employee_id: 1210, status_id: 1, date: '2026-02-08', time: '09:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-08', time: '12:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 1, date: '2026-02-08', time: '13:30:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ },
            { ref_employee_id: 1210, status_id: 2, date: '2026-02-08', time: '18:00:00', device_id: 'CJ_DEV_001', seq_number: seqCounter++ }
        );

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
            date: {
                [Sequelize.Op.between]: ['2026-02-07', '2026-02-09']
            }
        }, {});
    }
};
