module.exports = (sequelize, DataTypes) => {
  const SchemeDuration = sequelize.define(
    "scheme_durations",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      duration_name: {
        type: DataTypes.STRING, // e.g., 6 Months, 12 Months
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

  return SchemeDuration;
};
