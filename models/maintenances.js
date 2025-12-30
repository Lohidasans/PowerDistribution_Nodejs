module.exports = (sequelize, DataTypes) => {
    const Maintenance = sequelize.define(
        "maintenances",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            maintenance_type_id: {  // comes from type of maintenance_types table
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            technician_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            machine_performance: {
                type: DataTypes.ENUM("Good", "Fair", "Poor", "Needs Attention"),
                allowNull: false,
            },
            remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
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
    return Maintenance;
};
