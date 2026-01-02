module.exports = (sequelize, DataTypes) => {
  const PurchaseReturn = sequelize.define(
    "purchase_returns",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      pr_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      pr_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      grn_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      vendor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      order_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      reference_id: {
        type: DataTypes.STRING,
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
      // Totals & Taxes
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
      amount_in_words: {
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

  return PurchaseReturn;
};

