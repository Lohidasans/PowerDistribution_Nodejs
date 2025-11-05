module.exports = (sequelize, DataTypes) => {
  const ModuleGroup = sequelize.define("module_groups",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      module_group_name: { //General, master, purchase mgt, Hr Mgt
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields
      createdAt: "created_at", // Rename `createdAt` field to `created_at`
      updatedAt: "updated_at", // Rename `updatedAt` field to `updated_at`
      paranoid: true, // Enables soft delete
      deletedAt: "deleted_at", // Column name for the soft delete timestamp
    }
  );

  return ModuleGroup;
};

