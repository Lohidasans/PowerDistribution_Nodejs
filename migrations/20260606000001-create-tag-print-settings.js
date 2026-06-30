'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const [tables] = await queryInterface.sequelize.query(
            `SELECT to_regclass('public.tag_print_settings') AS tbl;`
        );
        const tableExists = !!tables[0].tbl;

        if (!tableExists) {
            await queryInterface.createTable('tag_print_settings', {
                id: {
                    allowNull: false,
                    autoIncrement: true,
                    primaryKey: true,
                    type: Sequelize.INTEGER,
                },
                entity_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                },
                entity_type: {
                    type: Sequelize.STRING(50),
                    allowNull: false,
                },
                settings: {
                    type: Sequelize.JSONB,
                    allowNull: false,
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

        // Idempotent: skips if the index already exists, but still surfaces
        // real failures (e.g. duplicate rows) instead of swallowing them.
        await queryInterface.sequelize.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_print_settings_entity
             ON tag_print_settings (entity_id, entity_type);`
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable('tag_print_settings');
    },
};
