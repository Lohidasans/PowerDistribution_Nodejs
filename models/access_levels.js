// models/AccessLevel.js
module.exports = (sequelize, DataTypes) => {
    const AccessLevel = sequelize.define(
        "access_levels",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            access_name: {
                type: DataTypes.STRING,
                allowNull: false, // Example: Full Access, View Only, Edit Only
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

    return AccessLevel;
};
