module.exports = (sequelize, DataTypes) => {
    const InvoiceBillItem = sequelize.define(
        "sales_invoice_bill_items",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            invoice_bill_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            product_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            product_item_detail_id: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            hsn_code: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            product_name_snapshot: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            purity_snapshot: {
                type: DataTypes.DECIMAL(10, 3),
                allowNull: true,
            },
            quantity: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            rate: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            discount_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
                defaultValue: 0,
            },
            amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            cgst_percent: {
                type: DataTypes.DECIMAL(6, 3),
                allowNull: true,
            },
            sgst_percent: {
                type: DataTypes.DECIMAL(6, 3),
                allowNull: true,
            },
            cgst_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            sgst_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            notes: {
                type: DataTypes.STRING,
                allowNull: true,
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

    return InvoiceBillItem;
};
