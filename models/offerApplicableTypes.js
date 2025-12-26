module.exports = (sequelize, DataTypes) => {
    const OfferApplicableType = sequelize.define(
        "offer_applicable_types",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            type_name: {
                type: DataTypes.STRING, // e.g., "Product", "Category", "All Products"
                allowNull: false,
                unique: true,
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

    return OfferApplicableType;
};