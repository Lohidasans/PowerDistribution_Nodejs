module.exports = (sequelize, DataTypes) => {
  const ProductSearchItem = sequelize.define(
    "sales_return_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      sales_return_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      product_item_detail_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      sku_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      hsn_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      product_description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      net_weight: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      gross_weight: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      gross_weight: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      rate: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
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

  return ProductSearchItem;
};
