module.exports = (sequelize, DataTypes) => {
  const GrnItem = sequelize.define(
    "grnItems",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      // Parent GRN
      grn_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // From other master tables (store only IDs)
      ref_no: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      material_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      purity: {
        type: DataTypes.ENUM("80", "92.5", "99.9", "91.75", "100"),
        allowNull: true,
      },
      material_price_per_g: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: true,
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      subcategory_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM("Weight", "Piece"),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
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
      total_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      comments: {
        type: DataTypes.STRING,
        allowNull: true,
      }
    },
    {
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  return GrnItem;
};
