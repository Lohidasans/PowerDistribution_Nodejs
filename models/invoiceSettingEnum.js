module.exports = (sequelize, DataTypes) => {
  const InvoiceSettingEnum = sequelize.define(
    "invoiceSettingEnum",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },

      invoice_setting_enum: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      status: {
        type: DataTypes.ENUM("Active", "Inactive"),
        allowNull: false,
        defaultValue: "Active",
      },
    },
    {
      tableName: "invoice_setting_enum",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      charset: "utf8mb4",
      paranoid: true,
      collate: "utf8mb4_unicode_ci",
      deletedAt: "deleted_at",
    }
  );

  // Define associations
  InvoiceSettingEnum.associate = function (models) {
    // Reverse association with InvoiceSettings
    InvoiceSettingEnum.hasMany(models.InvoiceSetting, {
      foreignKey: "invoice_sequence_name_id",
      as: "invoiceSettings",
    });
  };

  return InvoiceSettingEnum;
};
