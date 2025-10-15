module.exports = (sequelize, DataTypes) => {
  const ProductAdditionalDetail = sequelize.define(
    "productAdditionalDetails",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      item_detail_id: {// belongs to a specific item row
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      label_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      unit: {
        type: DataTypes.STRING,
        allowNull: true
      },
      price: {  
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      visibility: {
        type: DataTypes.ENUM("Show", "Hide"),
        allowNull: true
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

  return ProductAdditionalDetail;
};
