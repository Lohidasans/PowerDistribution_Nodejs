module.exports = (sequelize, DataTypes) => {
  const MaintenanceHistory = sequelize.define(
    "maintenance_history",
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

      asset_management_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      maintenance_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      technician_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      machine_performance_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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

  return MaintenanceHistory;
};
