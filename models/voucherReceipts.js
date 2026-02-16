const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Receipt = sequelize.define(
    "voucher_receipts",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      receipt_no: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      receipt_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      bill_type_id: { // Bill by bill, On Account, Advance, Others, Scheme
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      payment_mode_id: { // cash, card, bank transfer, cheque, upi, other
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      account_id: {
        type: DataTypes.INTEGER, // vendor_id or customer_id
        allowNull: false,
      },
      transaction_no: {
        type: DataTypes.STRING(100),
        allowNull: true, // required only for non-cash
      },
      reference_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      amount_in_words: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      user_type_id: { // customer_id/vendor_id
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      remarks: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: "voucher_receipts",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at",
      paranoid: true,
      underscored: true,
    },
  );

  return Receipt;
};
