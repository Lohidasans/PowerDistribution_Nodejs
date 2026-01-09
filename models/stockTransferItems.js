module.exports = (sequelize, DataTypes) => {
  const StockTransferItem = sequelize.define(
    "stock_transfer_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      stock_transfer_id: {
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
      material_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      subcategory_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      product_description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      available_quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      transfer_quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
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

  return StockTransferItem;
};
