module.exports = (sequelize, DataTypes) => {
  const OnlineOrderInvoiceItem = sequelize.define(
    "online_order_invoice_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },

      online_order_invoice_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      order_item_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      product_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },

      quantity: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      rate: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      amount: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      tax_amount: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      total_amount: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },
    },
    {
      tableName: "online_order_invoice_items",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
      deletedAt: "deleted_at",
      paranoid: true,
    }
    );

  return OnlineOrderInvoiceItem;
};