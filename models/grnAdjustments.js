module.exports = (sequelize, DataTypes) => {
    const GrnAdjustment = sequelize.define(
        "grn_adjustments",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },

            grn_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            adjustment_weight_in_g: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
                defaultValue: 0,
            },

            adjustment_quantity: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },

            adjustment_type: {
                type: DataTypes.ENUM(
                    "SHORTAGE",
                    "EXCESS",
                    "DAMAGED",
                    "WASTAGE",
                    "MANUAL"
                ),
                allowNull: false,
                defaultValue: "MANUAL",
            },

            remarks: {
                type: DataTypes.TEXT,
                allowNull: false,
            },

            completed_by: {
                type: DataTypes.INTEGER, // pass the super admin id here
                allowNull: true,
            },

            branch_id: { // pass the login branch_id here
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            }
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
        }
    );

    return GrnAdjustment;
};