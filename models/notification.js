module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "notifications",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },

      notification_type: {
        type: DataTypes.STRING,
        defaultValue: "INFO",
      },

      is_read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "notifications",
      timestamps: true,
      paranoid: true,
      underscored: true,
    }
  );
};