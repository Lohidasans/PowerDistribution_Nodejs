module.exports = (sequelize, DataTypes) => {
  const RolePermission = sequelize.define("role_permissions",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      module_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      access_level_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      }, 
      role_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      department_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields
      createdAt: "created_at", // Rename `createdAt` field to `created_at`
      updatedAt: "updated_at", // Rename `updatedAt` field to `updated_at`
      paranoid: true,
      deletedAt: "deleted_at", // Column name for the soft delete timestamp
    }
  );

  return RolePermission;
};
