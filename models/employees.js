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
                unique: true,
            },
            employee_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            department: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            designation: {
                type: DataTypes.STRING,
                allowNull: false,
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
            branch: {
                type: DataTypes.STRING,
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
            indexes: [{ fields: ["employee_no"] }],
        }
    );

    return Employee;
};
