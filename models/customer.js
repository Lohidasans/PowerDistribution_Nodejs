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
        allowNull: false
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
