module.exports = (sequelize, DataTypes) => {
  const SalesInvoiceBill = sequelize.define(
    "sales_invoice_bills",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      invoice_no: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      invoice_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      invoice_time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      subtotal_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      cgst_percent: {
        type: DataTypes.DECIMAL(6, 3),
        allowNull: true,
      },
      sgst_percent: {
        type: DataTypes.DECIMAL(6, 3),
        allowNull: true,
      },
      cgst_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sgst_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      discount_type: {
        type: DataTypes.ENUM("Amount", "Percentage"),
        allowNull: true,
      },
      discount_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        defaultValue: 0,
      },
      total_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      amount_due: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      refund_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      total_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      hasBillAdjustment: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      amount_in_words: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("Draft", "Printed", "Invoice", "Cancelled", "On Hold"),
        allowNull: false,
        defaultValue: "Draft",
      },
      order_type: {
        type: DataTypes.ENUM("Online", "Offline"),
        allowNull: false,
        defaultValue: "Offline",
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

  return SalesInvoiceBill;
};
