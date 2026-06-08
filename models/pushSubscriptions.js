module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'push_subscriptions',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      endpoint: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      p256dh: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      auth: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      user_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: 'push_subscriptions',
      timestamps: true,
      underscored: true,
    }
  );
};
