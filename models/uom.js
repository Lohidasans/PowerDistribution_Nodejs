module.exports = (sequelize, DataTypes) => {
  const Uom = sequelize.define(
    "uoms",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },

      uom_code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true, // already unique here, no need duplicate index
      },

      uom_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },

      short_code: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },

      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
      },

      status: {
        type: DataTypes.ENUM("Active", "Inactive"),
        allowNull: false,
        defaultValue: "Active",
      },
    },
    {
      tableName: "uoms",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at",
      paranoid: true,
      underscored: true,

      indexes: [
        // Prevent duplicate UOM per branch
        {
          unique: true,
          fields: ["uom_name", "short_code", "branch_id"],
        },

        // Faster filtering
        {
          fields: ["branch_id"],
        },
        {
          fields: ["status"],
        },
      ],
    }
  );

  return Uom;
};
