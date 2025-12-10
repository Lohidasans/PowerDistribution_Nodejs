const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
    const PaymentMode = sequelize.define(
        "payment_modes",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            payment_mode: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            deletedAt: "deleted_at",
            paranoid: true,
            underscored: true,
            tableName: "payment_modes",
        }
    );

    return PaymentMode;
};
