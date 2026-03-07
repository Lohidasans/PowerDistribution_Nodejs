module.exports = (sequelize, DataTypes) => {
    const OfferApplicable = sequelize.define(
        "offer_applicables",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },

            offer_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            material_type_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            category_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            subcategory_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            product_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            }
        },
        {
            tableName: "offer_applicables",
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
        }
    );

    return OfferApplicable;
};