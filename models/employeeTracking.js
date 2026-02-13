module.exports = (sequelize, DataTypes) => {
    const EmployeeTracking = sequelize.define(
        "employee_tracking",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            ref_employee_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            status_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: 1, // 1 = IN, 2 = OUT
            },
            date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            time: {
                type: DataTypes.TIME,
                allowNull: false,
            },
            device_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            seq_number: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
        },
        {
            tableName: "employee_tracking",
            timestamps: false,
            paranoid: false 
        }
    );
    return EmployeeTracking;
};
