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
        unique: true,
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
      status: {
        type: DataTypes.ENUM("Draft", "Printed", "Paid", "Cancelled"),
        allowNull: false,
        defaultValue: "Draft",
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
