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
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_bill_adjusted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      total_amount: {  // total amount of old jewels
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      amount_in_words: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("Draft", "Printed", "On Hold", "Cancelled"),
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

  return OldJewel;
};
