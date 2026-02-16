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

            charge_name: {  // additional charge name (e.g., "Shipping", "Handling", etc.)
                type: DataTypes.STRING,
                allowNull: false,
            },

            amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
        },
        {
            timestamps: true,
            paranoid: true,
        }
    );

    return SalesOrderAdditionalCharge;
};
