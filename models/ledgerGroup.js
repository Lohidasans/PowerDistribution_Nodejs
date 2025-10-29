module.exports = (sequelize, DataTypes) => {
  const LedgerGroup = sequelize.define(
    "LedgerGroup",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      ledger_group_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      ledger_group_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    },
    {
      tableName: "ledger_group",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  // Add any associations here if needed
  LedgerGroup.associate = (models) => {
    // Example association (uncomment if needed):
    // LedgerGroup.hasMany(models.SomeOtherModel, {
    //   foreignKey: "ledger_group_id",
    //   as: "relatedRecords",
    // });
  };

  return LedgerGroup;
};
