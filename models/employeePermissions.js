module.exports = (sequelize, DataTypes) => {
    const EmployeePermission = sequelize.define(
        "employee_permissions",
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
            },
            module_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            access_level_id: {
                type: DataTypes.INTEGER,
                allowNull: false,      // 1 = View, 2 = Edit, 3 = Full
            },
            department_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            role_name: {
                type: DataTypes.STRING,
                allowNull: false,
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

    return EmployeePermission;
};
