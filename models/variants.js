module.exports = (sequelize, DataTypes) => {
  const Variant = sequelize.define(
    "variants",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      variant_type: {
        type: DataTypes.STRING, // e.g., Stone Color, Size, Occasion
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
      indexes: [
        { unique: true, fields: ["variant_type"] },
      ],
    }
  );

  return Variant;
};
