module.exports = (sequelize, DataTypes) => {
  const OnlineOrderInvoice = sequelize.define(
    "online_order_invoices",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },

      invoice_no: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },

      order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      subtotal: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      tax_amount: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      discount_amount: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      shipping_charge: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      total_amount: {
        type: DataTypes.DECIMAL(18, 2),
        defaultValue: 0,
      },

      invoice_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
    },
    {
      tableName: "online_order_invoices",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at",
      paranoid: true,
    }
  );

  return OnlineOrderInvoice;
};