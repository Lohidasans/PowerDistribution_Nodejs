module.exports = (sequelize, DataTypes) => {
  const OldJewel = sequelize.define(
    "old_jewels",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      old_jewel_code: {
        type: DataTypes.STRING,
        allowNull: true,
        unique:true
      },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      sub_total_amount: { // total amount of old jewels
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
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
      discount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_amount: {  // after sgst and cgst added
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      amount_in_words: {
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

  return OldJewel;
};
