module.exports = (sequelize, DataTypes) => {
  const EmployeeDesignation = sequelize.define(
    "employee_designations",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      designation_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "employee_designations",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      charset: "utf8mb4",
      paranoid: true,
      collate: "utf8mb4_unicode_ci",
      deletedAt: "deleted_at",
    }
  );

  return EmployeeDesignation;
};
