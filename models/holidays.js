const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Holiday = sequelize.define(
    "holidays",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      holiday_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        unique: true,
      },
      holiday_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      branch_id:{
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1, // default branch_id to 1 for all holidays
      }
    },
    {
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );
  return Holiday;
};
