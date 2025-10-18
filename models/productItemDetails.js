module.exports = (sequelize, DataTypes) => {
  const ProductItemDetail = sequelize.define(
    "productItemDetails",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sku_id: {
        type: DataTypes.STRING, // Child Sku_ids auto increment in UI
        allowNull: true,
      },
      variation: {
        type: DataTypes.STRING, //variation: "[name: finish, values: [Gold]]"
        allowNull: true,
      },
      // Item detail fields
      gross_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: false
      },
      net_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: false
      },
      stone_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true
      },
      stone_value: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      making_charge_type: {
        type: DataTypes.ENUM("Amount", "Percentage"),
        allowNull: true
      },
      making_charge: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      wastage_type: {
        type: DataTypes.ENUM("Amount", "Percentage"),
        allowNull: true
      },
      wastage: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      rate_per_gram: { // Piece realted Fields 
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      base_price: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      measurement_type: {
        type: DataTypes.ENUM("cm", "mm"),
        allowNull: true
      },
      width: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true
      },
      length: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true
      },
      height: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      tag_url: {
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

  return ProductItemDetail;
};
