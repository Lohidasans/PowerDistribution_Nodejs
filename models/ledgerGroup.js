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
      ledger_account_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Self-reference: NULL = top-level group under a nature; set = sub-group
      // nested under another ledger_group (inherits the parent's nature).
      parent_group_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      branch_id:{
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 1, // default branch_id to 1 for all ledger groups
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

  LedgerGroup.associate = (models) => {
    // Nested groups: a group belongs to one parent and can have many children.
    // LedgerGroup.belongsTo(models.LedgerGroup, {
    //   as: "parent",
    //   foreignKey: "parent_group_id",
    // });
    // LedgerGroup.hasMany(models.LedgerGroup, {
    //   as: "children",
    //   foreignKey: "parent_group_id",
    // });
  };

  return LedgerGroup;
};
