module.exports = (sequelize, DataTypes) => {
  const Grn = sequelize.define(
    "grns",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      grn_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      grn_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      po_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      vendor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      order_by_user_id: {
        type: DataTypes.INTEGER, // User who created/approved
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
    },
    {
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  return Grn;
};
