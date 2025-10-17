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
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      variant_type: {
        type: DataTypes.STRING, // e.g., Stone Color, Size, Occasion
        allowNull: true,
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
      indexes: [{ unique: true, fields: ["variant_type"] }],
    }
  );

  Variant.associate = (models) => {
    Variant.hasMany(models.VariantValue, {
      foreignKey: "variant_id",
      as: "variant_values",
      onDelete: "CASCADE", // auto delete variant values
      hooks: true,
    });
  };

  return Variant;
};
