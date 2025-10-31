module.exports = (sequelize, DataTypes) => {
  const State = sequelize.define(
    "states",
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
      state_code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      state_name: {
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

  return State;
};
