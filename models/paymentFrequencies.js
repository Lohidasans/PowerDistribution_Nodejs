module.exports = (sequelize, DataTypes) => {
  const PaymentFrequency = sequelize.define(
    "payment_frequencies",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      frequency_name: {
        type: DataTypes.STRING, // e.g., Monthly, Half Yearly, Quarterly, Yearly
        allowNull: false,
        unique: true,
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

  return PaymentFrequency;
};
