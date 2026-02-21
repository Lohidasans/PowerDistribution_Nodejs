module.exports = (sequelize, DataTypes) => {
    const SalesOrderAdditionalCharge = sequelize.define(
        "sales_order_additional_charges",
        {
            id: {
                primaryKey: true,
                autoIncrement: true,
                type: DataTypes.INTEGER,
            },

            sales_order_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            charge_type_id: {  // comes from charge_types table (e.g., 1 for "Additional Charges", 2 for "Delivery Charges", etc.)
                type: DataTypes.INTEGER,
                allowNull: true,   
            },

            amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
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

    return SalesOrderAdditionalCharge;
};
