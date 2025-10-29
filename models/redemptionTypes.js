module.exports = (sequelize, DataTypes) => {
  const RedemptionType = sequelize.define(
    "redemption_types",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      type_name: {
        type: DataTypes.STRING, // e.g., Jewellery, Coins, Bars
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

  return RedemptionType;
};
