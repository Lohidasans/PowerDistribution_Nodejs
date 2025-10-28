module.exports = (sequelize, DataTypes) => {
    const EmployeeExperience = sequelize.define(
        "employee_experiences",
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
            organization_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            role: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            duration_from: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            duration_to: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            location: {
                type: DataTypes.STRING,
                allowNull: true,
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
            indexes: [{ fields: ["employee_id"] }],
        }
    );

    return EmployeeExperience;
};
