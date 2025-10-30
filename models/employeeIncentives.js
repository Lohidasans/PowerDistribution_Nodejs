module.exports = (sequelize, DataTypes) => {
  const EmployeeIncentive = sequelize.define(
    "employee_incentives",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      department_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sales_target: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: false,
      },
      incentive_type: {
        type: DataTypes.ENUM("Percentage", "Rupees"),
        allowNull: false,
      },
      incentive_value: {
        type: DataTypes.DECIMAL(10, 2), // can hold % or rupee value
        allowNull: false,
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

  return EmployeeIncentive;
};
