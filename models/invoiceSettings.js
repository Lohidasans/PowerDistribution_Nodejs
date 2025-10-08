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
        unique: true, // one-to-one with branch
        references: {
          model: "branches",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
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
      invoice_start_no: {
        type: DataTypes.INTEGER,
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

  return InvoiceSetting;
};
