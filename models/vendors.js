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
      vendor_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      vendor_code: {
        type: DataTypes.STRING, // VEN/01/24-25
        allowNull: false,
        unique: true,
      },
      vendor_name: {
        type: DataTypes.STRING, // Golden Hub Pvt. Ltd.
        allowNull: false,
      },
      proprietor_name: {
        type: DataTypes.STRING, // Shantanu
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
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
      country_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      state_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      district_id: {
        type: DataTypes.INTEGER,
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
        type: DataTypes.ENUM("10days", "15days", "20days", "25days", "30days"),
        allowNull: true,
      },
      material_type_ids: {
        type: DataTypes.ARRAY(DataTypes.INTEGER), // multiple material type IDs
        allowNull: true,
      },
      visibilities: {
        type: DataTypes.ARRAY(DataTypes.INTEGER), // multiple names e.g., ["HMK Silvers", "ShineCraft Silver"]
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
