module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define(
    "customers",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      customer_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      customer_name: {
        type: DataTypes.STRING,
        allowNull: true
      },
      email_id: {
        type: DataTypes.STRING,
        allowNull: true
      },
      mobile_number: {
        type: DataTypes.STRING,
        allowNull: false
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      country_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      state_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      district_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      pin_code: {
        type: DataTypes.STRING,
        allowNull: true
      },
      pan_no: {
        type: DataTypes.STRING,
        allowNull: true
      },
      gst_no: {
        type: DataTypes.STRING,
        allowNull: true
      },
      is_online: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      ledger_id: { // To store the associated ledger ID for the customer - to get the advance payment in the sales invoice
        type: DataTypes.INTEGER, 
        allowNull: true
      },
      wallet_advance_amount: { // To store the advance receipt amount in the customer's wallet
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00
      }
    },
    {
      tableName: "customers",
      underscored: true,
      paranoid: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      deletedAt: "deleted_at",
    }
  );

  return Customer;
};
