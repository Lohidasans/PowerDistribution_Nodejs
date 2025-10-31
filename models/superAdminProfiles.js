module.exports = (sequelize, DataTypes) => {
  const SuperAdminProfile = sequelize.define(
    "superadmin_profiles",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      company_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      proprietor: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      mobile_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email_id: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isEmail: true },
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      district_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      state_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      pin_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      branch_sequence_type: {
        type: DataTypes.ENUM("prefix", "suffix"),
        allowNull: false,
      },
      branch_sequence_value: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      joining_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
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

  return SuperAdminProfile;
};
