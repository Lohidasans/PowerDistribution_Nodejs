module.exports = (sequelize, DataTypes) => {
  const Quotation = sequelize.define(
    "quotations",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      qr_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      request_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      vendor_ids: {
        type: DataTypes.ARRAY(DataTypes.INTEGER), // multiple vendor IDs
        allowNull: true,
      },
      status_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1, // 1- pending, 2 - accepted, 3 - rejected
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      updated_by: {
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

  return Quotation;
};
