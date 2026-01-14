module.exports = (sequelize, DataTypes) => {
    const VendorPayments = sequelize.define(
        'vendor_payments',
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            payment_no: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            payment_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            bill_type_id: {  // comes from bill_types table
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            payment_mode: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            account_name_id: {
                type: DataTypes.INTEGER,  // vendor bank account name
                allowNull: true,
            },
            amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            amount_in_words: {
                type: DataTypes.TEXT,
                allowNull: false,
            },
            invoice_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            purchase_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            ref_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            status: {
                type: DataTypes.ENUM('Pending', 'Completed', 'Failed', 'Cancelled'),
                defaultValue: 'Completed',
            },
        },
        {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            deletedAt: 'deleted_at',
            paranoid: true,
        }
    );

    return VendorPayments;
};
