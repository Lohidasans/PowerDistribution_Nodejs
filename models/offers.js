module.exports = (sequelize, DataTypes) => {
    const Offer = sequelize.define(
        "offers",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },

            offer_code: {
                type: DataTypes.STRING, // OFF 01/24-25
                allowNull: false,
                unique: true,
            },

            offer_plan_id: {
                type: DataTypes.INTEGER, // FK → offer_plans.id
                allowNull: false,
            },

            offer_description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            offer_type: {
                type: DataTypes.ENUM("Percentage", "Amount"),
                allowNull: false,
            },

            offer_value: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
            },

            valid_from: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },

            valid_to: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },

            applicable_type_id: {
                type: DataTypes.INTEGER, // FK → offer_applicable_types.id
                allowNull: false,
            },

            status: {
                type: DataTypes.ENUM("Active", "Inactive"),
                allowNull: false,
                defaultValue: "Active",
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
            tableName: "offers",
        }
    );

    return Offer;
};