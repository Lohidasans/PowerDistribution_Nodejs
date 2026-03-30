'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('employee_attendance_reports', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            employee_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'employees', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            ref_employee_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            date: {
                type: Sequelize.DATEONLY,
                allowNull: false,
            },
            status: {
                type: Sequelize.ENUM('Present', 'Absent'),
                allowNull: false,
                defaultValue: 'Absent',
            },
            clock_in: {
                type: Sequelize.TIME,
                allowNull: true,
            },
            clock_out: {
                type: Sequelize.TIME,
                allowNull: true,
            },
            break_hours: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
            },
            production_hours: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
            },
            overtime_hours: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
            },
            total_hours: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
            },
            late_by_hours: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('NOW()'),
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('NOW()'),
            },
        });

        // Unique constraint: one record per employee per date
        await queryInterface.addIndex('employee_attendance_reports', ['employee_id', 'date'], {
            unique: true,
            name: 'uq_attendance_report_employee_date',
        });

        // Performance indexes
        await queryInterface.addIndex('employee_attendance_reports', ['date'], {
            name: 'idx_attendance_report_date',
        });
        await queryInterface.addIndex('employee_attendance_reports', ['employee_id'], {
            name: 'idx_attendance_report_employee_id',
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('employee_attendance_reports');
        // Note: dropTable also removes related indexes in Postgres
    },
};
