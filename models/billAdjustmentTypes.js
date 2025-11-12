const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BillAdjustmentType = sequelize.define('bill_adjustment_types', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
    paranoid: true,
    underscored: true,
    tableName: 'bill_adjustment_types'
  });

  return BillAdjustmentType;
};
