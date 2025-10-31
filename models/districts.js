module.exports = (sequelize, DataTypes) => {
  const District = sequelize.define(
    "districts",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      country_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      state_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      short_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      district_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
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

  return District;
};
