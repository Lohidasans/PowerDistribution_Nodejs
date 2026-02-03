module.exports = (sequelize, DataTypes) => {
  const AssetManagement = sequelize.define(
    "asset_management",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },

      asset_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      journal_entry_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      ledger_account_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      asset_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      purchase_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      asset_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },

      serial_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      vendor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      upload_invoice_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      status_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      maintenance_cycle_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      next_maintenance_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },

      warranty_expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },

      upload_document_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      department_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      receipt_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      upload_disposal_document_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      disposal_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "asset_management",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  return AssetManagement;
};
