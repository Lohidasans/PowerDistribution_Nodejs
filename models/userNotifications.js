module.exports = (sequelize, DataTypes) => {
    const UserNotification = sequelize.define(
        "user_notifications",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            title: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            user_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            message: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            is_read: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
                defaultValue: false,
            },
            type: {
                type: DataTypes.STRING,
                allowNull: true,
            },
        },
        {
            tableName: "user_notifications",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
        }
    );

    return UserNotification;
};
