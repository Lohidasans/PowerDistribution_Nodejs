// models/customerAddress.js
module.exports = (sequelize, DataTypes) => {
    const CustomerAddress = sequelize.define(
        "customer_addresses",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            customer_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            mobile_number: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            address_line: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            country_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            state_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            district_id: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            pin_code: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            is_default: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
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

    return CustomerAddress;
};
