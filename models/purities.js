const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Purity = sequelize.define(
        'purities',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },

            purity_value: {
                type: DataTypes.STRING(10), // supports 92.5, 99.9, etc
                allowNull: false,
                unique: true,
            },
        },
        {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            deletedAt: 'deleted_at',
            paranoid: true,
            underscored: true,
            tableName: 'purities',
        }
    );

    return Purity;
};
