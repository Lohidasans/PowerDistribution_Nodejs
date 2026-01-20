const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Leave = sequelize.define(
    "leaves",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      leave_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      leave_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      employee_id:{
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      branch_id:{
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status_id:{
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      approved_by_id:{
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      entity_type_name:{
        type: DataTypes.STRING,
        allowNull: true,
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

  return Leave;
};
