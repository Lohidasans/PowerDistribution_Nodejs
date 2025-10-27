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
      invoice_sequence_name_id: {
        type: DataTypes.INTEGER,
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
    }
  );

  // Define associations
  InvoiceSetting.associate = function (models) {
    // Association with Branch
    InvoiceSetting.belongsTo(models.Branch, {
      foreignKey: "branch_id",
      as: "branch",
    });

    // Association with InvoiceSettingEnum
    InvoiceSetting.belongsTo(models.InvoiceSettingEnum, {
      foreignKey: "invoice_sequence_name_id",
      as: "invoiceSequenceName",
    });
  };

  return InvoiceSetting;
};
