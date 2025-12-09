const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BillType = sequelize.define('bill_types', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bill_type: {
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
    tableName: 'bill_types'
  });

  return BillType;
};
