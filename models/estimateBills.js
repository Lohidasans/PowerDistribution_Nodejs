module.exports = (sequelize, DataTypes) => {
  const EstimateBill = sequelize.define(
    "estimate_bills",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      estimate_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      estimate_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      estimate_time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
      amount_in_words: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("Draft", "Printed", "Cancelled"),
        allowNull: false,
        defaultValue: "Printed",
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

  return EstimateBill;
};
