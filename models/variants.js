module.exports = (sequelize, DataTypes) => {
  const Variant = sequelize.define(
    "variant",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      variant_type: {
        type: DataTypes.STRING, // e.g., Stone Color, Size, Occasion
        allowNull: true,
      },
      branch_id:{
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1, // default branch_id to 1 for all variants
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
  return Variant;
};
