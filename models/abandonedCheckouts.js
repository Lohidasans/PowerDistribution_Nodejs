module.exports = (sequelize, DataTypes) => {
    const AbandonedCheckout = sequelize.define(
        'abandoned_checkouts',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            user_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            customer_name: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            customer_email: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            customer_phone: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            product_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            product_name: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            product_image: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            behaviour: {
                type: DataTypes.ENUM(
                    'Browser Only',
                    'Wishlist',
                    'Add to cart',
                    'Cart Abandoned'
                ),
                allowNull: false,
            },
            contact_status: {
                type: DataTypes.ENUM('Not Contacted', 'Contacted'),
                allowNull: false,
                defaultValue: 'Not Contacted',
            },
            phone_status: {
                type: DataTypes.ENUM('Pending', 'Reached', 'Not Reachable', 'Not Interested'),
                allowNull: true,
                defaultValue: 'Pending',
            },
            email_status: {
                type: DataTypes.ENUM('Not Sent', 'Sent'),
                allowNull: true,
                defaultValue: 'Not Sent',
            },
            response: {
                type: DataTypes.ENUM(
                    'Purchase Later',
                    'Not Interested',
                    'Price Too High',
                    'Need Discount',
                    'Just Browsing',
                    'Will Visit Store',
                    'Bought from Other Store',
                    'Waiting for Salary / Budget',
                    'Product Not Available',
                    'Size / Design Not Suitable',
                    'Not Reachable'
                ),
                allowNull: true,
            },
            remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            updated_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
        },
        {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            paranoid: true,
            deletedAt: 'deleted_at',
        }
    );

    return AbandonedCheckout;
};
