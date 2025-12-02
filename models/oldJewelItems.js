module.exports = (sequelize, DataTypes) => {
  const OldJewelItem = sequelize.define(
    "old_jewel_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      old_jewel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      hsn_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      jewel_description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      grs_weight: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
      },
      dust_weight: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
      },
      net_weight: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
      },
      wastage: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
      },
      rate: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(10, 3),
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

  OldJewelItem.associate = (models) => {
    OldJewelItem.belongsTo(models.OldJewel, {
      foreignKey: 'old_jewel_id',
      as: 'oldJewel',
    });
  };

  return OldJewelItem;
};
