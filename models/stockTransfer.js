module.exports = (sequelize, DataTypes) => {
  const StockTransfer = sequelize.define(
    "stock_transfers",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      transfer_no: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      branch_from: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      branch_to: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      staff_name_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      reference_no: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      transport_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      grand_total: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      total_product: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      total_weight: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      total_quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status_id: {
        type: DataTypes.INTEGER, // 1- pending, 2 - completed
        allowNull: false,
        defaultValue: 1,
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

  return StockTransfer;
};
