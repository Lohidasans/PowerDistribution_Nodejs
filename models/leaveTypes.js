const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveType = sequelize.define('leave_types', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    leave_type_name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
  }, {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    paranoid: true,
    deletedAt: "deleted_at",
  }
  );
  return LeaveType;
};
