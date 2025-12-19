module.exports = (sequelize, DataTypes) => {
    const UserProductItem = sequelize.define(
        "cart_wishlist_items",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            product_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            product_item_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            order_item_type: {
                type: DataTypes.INTEGER,
                allowNull: false,
                comment: "1 = Wishlist, 2 = Cart",
            },
            quantity: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            net_weight: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: true,
            },
            // Basic snapshot (NOT full order snapshot)
            product_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            sku_id: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            thumbnail_image: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            is_wishlisted: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            is_in_cart: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },


            // Optional: price at time of adding (informational only)
            estimated_price: {
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

    return UserProductItem;
};
