module.exports = (sequelize, DataTypes) => {
    const SalesInvoiceAdjustment = sequelize.define(
        "sales_invoice_adjustments",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            sales_invoice_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            adjustment_type_id: {
                type: DataTypes.STRING, // "Saving Scheme", "Old Jewel", "Sales Return"
                allowNull: false,
            },
            reference_id: {
                type: DataTypes.INTEGER,
                allowNull: true, //scheme_id, old_jewel_id, or sales_return_id depending on type
            },
            reference_no: {
                type: DataTypes.STRING, // SCH 25/24-25, OJ-001, SR-002 etc.
                allowNull: true,    
            },
            adjustment_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
                defaultValue: 0,
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

    return SalesInvoiceAdjustment;
};
