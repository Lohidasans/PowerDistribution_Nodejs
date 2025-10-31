module.exports = (sequelize, DataTypes) => {
  const Country = sequelize.define(
    "countries",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      country_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      short_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      currency_symbol: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      country_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      country_image_url: {
        type: DataTypes.STRING,
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

  return Country;
};
