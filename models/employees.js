module.exports = (sequelize, DataTypes) => {
    const Employee = sequelize.define(
        "employees",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            profile_image_url: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            employee_no: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            employee_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            department_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            role_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            joining_date: {
                type: DataTypes.DATEONLY,
                allowNull: true,
                defaultValue: null,
            },
            employment_type: {
                type: DataTypes.ENUM("Full-Time", "Part-Time", "Contract"),
                allowNull: true,
                defaultValue: null,
            },
            gender: {
                type: DataTypes.ENUM("Male", "Female", "Other"),
                allowNull: true,
                defaultValue: null,
            },
            date_of_birth: {
                type: DataTypes.DATEONLY,
                allowNull: true,
                defaultValue: null,
            },           
            branch_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM("Active", "Inactive"),
                allowNull: false,
                defaultValue: "Active",
            },
            ref_employee_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            device_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            enroll_type: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            is_enrolled: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            card: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            salary: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: true,
                defaultValue: null,
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
        }
    );
    return Employee;
};
