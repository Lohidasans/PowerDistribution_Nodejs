module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('payments', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    invoice_bill_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    jewel_repair_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    payment_mode: {
      type: DataTypes.ENUM('Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Other'),
      allowNull: false
    },
    amount_received: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true
    },
    payment_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    transaction_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('Pending', 'Completed', 'Failed', 'Refunded'),
      defaultValue: 'Completed'
    },
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
    underscored: true
  });

  return Payment;
};
