module.exports = (sequelize, DataTypes) => {
  const Ledger = sequelize.define(
    "Ledger",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      ledger_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      ledger_group_no: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      ledger_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "ledger",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  Ledger.associate = (models) => {
    Ledger.belongsTo(models.LedgerGroup, {
      foreignKey: "ledger_group_no",
      as: "ledgerGroup",
    });
  };

  return Ledger;
};
