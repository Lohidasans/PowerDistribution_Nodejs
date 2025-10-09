module.exports = (sequelize, DataTypes) => {
  const EmployeeIncentive = sequelize.define(
    "employeeIncentives",
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
        references: {
          model: "roles",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      incentive_target: {
        type: DataTypes.DECIMAL(15, 2), // e.g. 200000.00
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
      indexes: [{ fields: ["role_id"] }],
    }
  );

  return EmployeeIncentive;
};
