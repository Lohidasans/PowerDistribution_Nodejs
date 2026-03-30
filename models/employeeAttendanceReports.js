module.exports = (sequelize, DataTypes) => {
    const EmployeeAttendanceReport = sequelize.define(
        "employee_attendance_reports",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            employee_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: "FK → employees.id",
            },
            ref_employee_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: "FK → employees.ref_employee_id (device ref)",
            },
            date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
                comment: "Attendance date",
            },
            status: {
                type: DataTypes.ENUM("Present", "Absent"),
                allowNull: false,
                defaultValue: "Absent",
            },
            clock_in: {
                type: DataTypes.TIME,
                allowNull: true,
                comment: "First punch-in time (raw HH:mm:ss)",
            },
            clock_out: {
                type: DataTypes.TIME,
                allowNull: true,
                comment: "Last punch-out time (raw HH:mm:ss)",
            },
            break_hours: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
                comment: "Total break / idle hours",
            },
            production_hours: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
                comment: "Effective production hours (capped at standard)",
            },
            overtime_hours: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
                comment: "Hours worked beyond office end time",
            },
            total_hours: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
                comment: "Clock-out minus clock-in in hours",
            },
            late_by_hours: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
                comment: "Hours late from official start time",
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            // No paranoid – reports are append-only; delete physically if needed
            indexes: [
                {
                    // Prevent duplicate daily records per employee
                    unique: true,
                    fields: ["employee_id", "date"],
                    name: "uq_attendance_report_employee_date",
                },
                { fields: ["date"] },
                { fields: ["employee_id"] },
            ],
        }
    );
    return EmployeeAttendanceReport;
};
