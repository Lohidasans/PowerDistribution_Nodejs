module.exports = (sequelize, DataTypes) => {
  const PurchaseOrderItem = sequelize.define(
    "purchase_order_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      po_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      ref_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      material_price_per_g: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      material_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      subcategory_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      purity: {
        type: DataTypes.ENUM("80", "92.5", "99.9", "91.75", "100"),
        allowNull: true,
        defaultValue: "92.5"
      },
      type: {
        type: DataTypes.ENUM("Weight", "Piece"),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      total_wt_in_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      bag_wt_in_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      gross_wt_in_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      stone_wt_in_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      others: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      others_wt_in_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      others_value: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      net_wt_in_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      purchase_rate: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      stone_rate: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      making_charge: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      rate_per_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
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

  return PurchaseOrderItem;
};


