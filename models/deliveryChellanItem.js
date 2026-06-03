  module.exports = (sequelize, DataTypes) => {
    const DeliveryChellanItem = sequelize.define(
      "delivery_chellan_item",
      {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: DataTypes.INTEGER,
        },

        delivery_chellan_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },

        sku_id: {
          type: DataTypes.STRING,
          allowNull: false,
        },

        product_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },

        product_item_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },

        product_description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },

        quantity: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },

        weight: {
          type: DataTypes.DECIMAL(10, 3), // supports kg/grams
          allowNull: true,
        },

        amount: {
          type: DataTypes.DECIMAL(15, 2),
          allowNull: false,
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

    return DeliveryChellanItem;
  };
