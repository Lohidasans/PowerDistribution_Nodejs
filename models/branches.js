module.exports = (sequelize, DataTypes) => {
  const Branch = sequelize.define(
    "branches",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      branch_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      branch_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      contact_person: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      mobile: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      district_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      state_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      pin_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      gst_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      signature_url: {
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
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  Branch.associate = (models) => {
    Branch.hasMany(models.InvoiceSetting, {
      foreignKey: "branch_id",
      as: "invoiceSettings",
    });

    Branch.hasMany(models.Employee, {
      foreignKey: "branch_id",
      as: "employees",
    });
  };

  return Branch;
};
