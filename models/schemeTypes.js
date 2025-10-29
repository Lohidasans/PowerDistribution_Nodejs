module.exports = (sequelize, DataTypes) => {
  const SchemeType = sequelize.define(
    "scheme_types",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      type_name: {
        type: DataTypes.STRING, // e.g., Weight Based, Value Based
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

  return SchemeType;
};
