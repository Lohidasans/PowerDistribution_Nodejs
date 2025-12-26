module.exports = (sequelize, DataTypes) => {
  const PurchaseOrder = sequelize.define(
    "purchase_orders",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      po_no: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      po_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      vendor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      order_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      gst_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      billing_address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      shipping_address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      subtotal_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      sgst_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      cgst_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      discount_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
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

  return PurchaseOrder;
};


