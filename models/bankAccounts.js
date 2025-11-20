module.exports = (sequelize, DataTypes) => {
  const BankAccount = sequelize.define(
    "bankAccounts",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      entity_type: {
        type: DataTypes.ENUM("branch", "vendor", "employee","superadmin"),
        allowNull: true,
      },
      entity_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      account_holder_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bank_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      ifsc_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      account_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bank_branch_name: {
        type: DataTypes.STRING,
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

  return BankAccount;
};
