module.exports = (sequelize, DataTypes) => {
  const PurchaseReturnItem = sequelize.define(
    "purchase_return_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },

      pr_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      ref_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Integer link to the exact GRN line being returned (grnItems.id).
      // Mirrors products.ref_no_id so returns and products reference a GRN line
      // the same way. Nullable: ad-hoc return lines not sourced from a GRN.
      grn_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      material_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      purity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
      },

      material_price_per_gram: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      subcategory_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      type: {
        type: DataTypes.ENUM("Weight", "Piece"),
        allowNull: true,
      },

      quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      total_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },

      bag_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },

      gross_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },

      stone_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },

      others: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      others_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },

      others_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      net_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },

      purchase_rate: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      stone_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      making_charge: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      rate_per_gram: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      total_amount: {
        type: DataTypes.DECIMAL(15, 2),
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

  return PurchaseReturnItem;
};