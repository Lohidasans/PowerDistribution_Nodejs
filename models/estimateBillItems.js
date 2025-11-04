module.exports = (sequelize, DataTypes) => {
  const EstimateBillItem = sequelize.define(
    "estimate_bill_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      estimate_bill_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // If you track per-piece/variation SKU
      product_item_detail_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      hsn_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      product_name_snapshot: {
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

  return EstimateBillItem;
};
