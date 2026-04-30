module.exports = (sequelize, DataTypes) => {
  const QuotationItem = sequelize.define(
    "quotation_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      quotation_id: {
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
      ref_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      material_price_per_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      purity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM("Weight", "Piece"),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      vendor_quotation_id: {
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
      vendor_remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.INTEGER,
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

  return QuotationItem;
};
