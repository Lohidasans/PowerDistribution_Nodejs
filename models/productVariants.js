'use strict';

module.exports = (sequelize, DataTypes) => {
    const ProductVariant = sequelize.define(
        'product_variants',
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            product_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            variant_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            variant_type_ids: {
                type: DataTypes.ARRAY(DataTypes.INTEGER), 
                allowNull: false,
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

    return ProductVariant;
};
