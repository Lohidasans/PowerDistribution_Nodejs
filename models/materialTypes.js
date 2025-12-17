module.exports = (sequelize, DataTypes) => {
  const MaterialType = sequelize.define(
    "materialTypes",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      material_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      material_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      material_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      // New fields
      purity_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      purity_percentage: {
        type: DataTypes.DECIMAL(5, 2), // Allows for percentages like 99.99
        allowNull: true,
      },
      website_visibility: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

  return MaterialType;
};
