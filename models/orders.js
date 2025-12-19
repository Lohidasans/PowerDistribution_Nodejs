module.exports = (sequelize, DataTypes) => {
    const Order = sequelize.define(
        "orders",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            order_number: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            order_date: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            customer_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            order_status: {
                type: DataTypes.INTEGER,  // 1 - order placed. 2 -Payment Success, 3 -Cancelled, 4 - Completed, 5 - Ready to ship
                allowNull: false,
            },
            subtotal: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
            tax_amount: {
                type: DataTypes.DECIMAL(15, 2),
                defaultValue: 0,
            },
            shipping_charge: { // delivery fee
                type: DataTypes.DECIMAL(15, 2),
                defaultValue: 0,
            },
            discount_amount: {
                type: DataTypes.DECIMAL(15, 2),
                defaultValue: 0,
            },
            total_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
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

    return Order;
};