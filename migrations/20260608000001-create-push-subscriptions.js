'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query(
      `SELECT to_regclass('public.push_subscriptions') AS tbl;`
    );
    const tableExists = !!tables[0].tbl;

    if (!tableExists) {
      await queryInterface.createTable('push_subscriptions', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER,
        },
        endpoint: {
          type: Sequelize.TEXT,
          allowNull: false,
          unique: true,
        },
        p256dh: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        auth: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        user_type: {
          type: Sequelize.STRING(50),
          allowNull: true,
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
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
      });
    }

    try {
      await queryInterface.addIndex('push_subscriptions', ['user_type', 'user_id'], {
        name: 'idx_push_subscriptions_user',
      });
    } catch (e) { /* already exists */ }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('push_subscriptions');
  },
};
