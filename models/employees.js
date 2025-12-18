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
                allowNull: false,
            },
            employment_type: {
                type: DataTypes.ENUM("Full-Time", "Part-Time", "Contract"),
                allowNull: false,
            },
            gender: {
                type: DataTypes.ENUM("Male", "Female", "Other"),
                allowNull: false,
            },
            date_of_birth: {
                type: DataTypes.DATEONLY,
                allowNull: false,
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
