'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const [tables] = await queryInterface.sequelize.query(
            `SELECT to_regclass('public.abandoned_checkouts') AS tbl;`
        );
        const tableExists = !!tables[0].tbl;

        if (!tableExists) {
            await queryInterface.createTable('abandoned_checkouts', {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.INTEGER,
                },
                user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL',
                },
                customer_name: {
                    type: Sequelize.STRING,
                    allowNull: true,
                },
                customer_email: {
                    type: Sequelize.STRING,
                    allowNull: true,
                },
                customer_phone: {
                    type: Sequelize.STRING,
                    allowNull: true,
                },
                product_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                },
                product_name: {
                    type: Sequelize.STRING,
                    allowNull: true,
                },
                product_image: {
                    type: Sequelize.STRING,
                    allowNull: true,
                },
                behaviour: {
                    type: Sequelize.ENUM(
                        'Browser Only',
                        'Wishlist',
                        'Add to cart',
                        'Cart Abandoned'
                    ),
                    allowNull: false,
                },
                contact_status: {
                    type: Sequelize.ENUM('Not Contacted', 'Contacted'),
                    allowNull: false,
                    defaultValue: 'Not Contacted',
                },
                phone_status: {
                    type: Sequelize.ENUM('Pending', 'Reached', 'Not Reachable', 'Not Interested'),
                    allowNull: true,
                    defaultValue: 'Pending',
                },
                email_status: {
                    type: Sequelize.ENUM('Not Sent', 'Sent'),
                    allowNull: true,
                    defaultValue: 'Not Sent',
                },
                response: {
                    type: Sequelize.ENUM(
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
                    type: Sequelize.TEXT,
                    allowNull: true,
                },
                updated_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: { model: 'users', key: 'id' },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL',
                },
                created_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('NOW()'),
                },
                updated_at: {
                    allowNull: false,
                    type: Sequelize.DATE,
                    defaultValue: Sequelize.literal('NOW()'),
                },
                deleted_at: {
                    allowNull: true,
                    type: Sequelize.DATE,
                },
            });
        }
    },

    async down(queryInterface) {
        await queryInterface.dropTable('abandoned_checkouts');
    },
};
