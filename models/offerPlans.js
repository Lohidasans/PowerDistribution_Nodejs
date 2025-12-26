module.exports = (sequelize, DataTypes) => {
    const OfferPlan = sequelize.define(
        "offer_plans",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            plan_name: {
                type: DataTypes.STRING, // e.g., "Direct Offer", "Conditional Offer"
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

    return OfferPlan;
};