module.exports = (sequelize, DataTypes) => {
    const VendorQuotation = sequelize.define(
        "vendor_quotations",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            quotation_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            vendor_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM("pending", "accepted", "rejected", "received"),
                allowNull: false,
                defaultValue: "pending",
            },
            vendor_quotation_number: {  // unique code for vendor quotation
                type: DataTypes.STRING,
                allowNull: true,
            },
            response_date: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            sub_total: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
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
            terms_and_conditions: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            attachment_url: {
                type: DataTypes.STRING(500),
                allowNull: true,
            },
            created_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            updated_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            branch_id:{
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: 1,
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

    return VendorQuotation;
};
