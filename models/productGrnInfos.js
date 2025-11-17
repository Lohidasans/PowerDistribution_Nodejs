module.exports = (sequelize, DataTypes) => {
  const ProductGrnInfo = sequelize.define(
    "product_grn_infos",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
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
        type: DataTypes.ENUM("92.5", "99.9", "91.75", "100"),
        allowNull: true,
      },
      material_price_per_g: {
        type: DataTypes.DECIMAL(15, 2),
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
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      stone_wt_in_g: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      others: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      others_wt_in_g: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      others_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      net_wt_in_g: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      purchase_rate: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      stone_rate: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      making_charge: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      rate_per_g: {
        type: DataTypes.DECIMAL(15, 2),
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

  return ProductGrnInfo;
};

