module.exports = (sequelize, DataTypes) => {
  const ProductAddOn = sequelize.define(
    "productAddOns",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      product_id: { 
        type: DataTypes.INTEGER, 
        allowNull: true 
      },
      addon_product_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false },
    },
    {
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  return ProductAddOn;
};
