module.exports = (sequelize, DataTypes) => {
  const InvoiceSetting = sequelize.define(
    "invoiceSettings",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sequence_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      invoice_prefix: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      invoice_suffix: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      invoice_start_no: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: "invoice_settings",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
      indexes: [
        {
          unique: true,
          fields: ["branch_id", "sequence_name"],
          name: "invoice_settings_branch_sequence_unique",
        },
      ],
    }
  );

  InvoiceSetting.associate = (models) => {
    InvoiceSetting.belongsTo(models.Branch, {
      foreignKey: "branch_id",
      as: "branch",
    });
  };

  return InvoiceSetting;
};
