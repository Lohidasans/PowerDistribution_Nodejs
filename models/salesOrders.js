module.exports = (sequelize, DataTypes) => {
    const SalesOrder = sequelize.define(
        "sales_orders",
        {
            id: {
                primaryKey: true,
                autoIncrement: true,
                type: DataTypes.INTEGER,
            },

            po_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            vendor_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            // NEW (from UI)
            sales_order_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            consignment_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            credit_terms: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            status: {
                type: DataTypes.ENUM("pending","accepted","rejected"),
                defaultValue: "pending",
            },

            response_date: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            
            // ❗ copied from PO (no recalculation)
            sgst_percentage: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
            },
            sgst_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
            cgst_percentage: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
            },
            cgst_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
            discount_percentage: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
            },
            discount_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
            total_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },

            created_by: DataTypes.INTEGER,
            updated_by: DataTypes.INTEGER,
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
        }
    );

    return SalesOrder;
};
