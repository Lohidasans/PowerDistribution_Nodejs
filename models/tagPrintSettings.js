module.exports = (sequelize, DataTypes) => {
    const TagPrintSetting = sequelize.define(
        'tag_print_settings',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            entity_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            entity_type: {
                type: DataTypes.STRING(50),
                allowNull: false,
            },
            settings: {
                type: DataTypes.JSONB,
                allowNull: false,
            },
        },
        {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
        }
    );

    return TagPrintSetting;
};
