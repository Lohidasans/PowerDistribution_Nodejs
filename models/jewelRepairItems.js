module.exports = (sequelize, DataTypes) => {
  const JewelRepairItem = sequelize.define(
    "jewel_repair_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      repair_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      material_type_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },      
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
      weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      remarks: {
        type: DataTypes.TEXT,
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

  return JewelRepairItem;
};
