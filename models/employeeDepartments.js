module.exports = (sequelize, DataTypes) => {
  const EmployeeDepartment = sequelize.define(
    "employee_departments",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      department_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "employee_departments",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      charset: "utf8mb4",
      paranoid: true,
      collate: "utf8mb4_unicode_ci",
      deletedAt: "deleted_at",
    }
  );

  return EmployeeDepartment;
};
