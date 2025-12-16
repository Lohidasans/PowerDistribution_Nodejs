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
                unique: true,
            },
            customer_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM(
                    "wishlist",
                    "in_cart",
                    "order_placed",
                    "processing",
                    "shipped",
                    "delivered",
                    "cancelled",
                    "returned",
                    "failed"
                ),
                defaultValue: "wishlist",
            },
            subtotal: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            tax_amount: {
                type: DataTypes.DECIMAL(15, 2),
                defaultValue: 0,
            },
            shipping_charge: {
                type: DataTypes.DECIMAL(15, 2),
                defaultValue: 0,
            },
            discount_amount: {
                type: DataTypes.DECIMAL(15, 2),
                defaultValue: 0,
            },
            total_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            // payment_method: DataTypes.STRING,
            // payment_status: {
            //     type: DataTypes.ENUM("pending", "paid", "failed", "refunded"),
            //     defaultValue: "pending",
            // },
            // shipping_address: DataTypes.JSONB,
            // billing_address: DataTypes.JSONB,
            // notes: DataTypes.TEXT,
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