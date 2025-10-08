module.exports = (sequelize, DataTypes) => {
  const Vendor = sequelize.define(
    "vendors",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      vendor_code: {
        type: DataTypes.STRING,   // e.g., VEN/01/24-25
        allowNull: false,
        unique: true,
      },
      vendor_name: {
        type: DataTypes.STRING,   // e.g., Golden Hub Pvt. Ltd.
        allowNull: false,
      },
      proprietor_name: {
        type: DataTypes.STRING,   // e.g., Shantanu
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isEmail: true },
      },
      mobile: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pan_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      gst_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      country: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "India",
      },
      state: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      district: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pin_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      opening_balance: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      opening_balance_type: {
        type: DataTypes.ENUM("Credit", "Debit"),
        allowNull: true,
      },
      payment_terms: {
        type: DataTypes.STRING,  // e.g., 10 days, 30 days
        allowNull: true,
      },
      material_type: {
        type: DataTypes.STRING,  // e.g., Gold, Silver
        allowNull: true,
      },
      branch_id: {
        type: DataTypes.INTEGER, // Foreign key to Branch table
        allowNull: true,
      },
      visibility: {
        type: DataTypes.STRING,  // e.g., HMK Silvers, ShineCraft Silver
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("Active", "Inactive"),
        allowNull: false,
        defaultValue: "Active",
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

  return Vendor;
};
