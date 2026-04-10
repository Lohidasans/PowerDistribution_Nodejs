module.exports = (sequelize, DataTypes) => {
    const CustomerSchemePayment = sequelize.define(
        "customer_scheme_payments",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },

            scheme_payment_code: { //SS001
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
            },

            enrollment_id: {
                type: DataTypes.INTEGER,
                allowNull: false, // FK → customer_enrollments.id
            },

            scheme_id: {
                type: DataTypes.INTEGER,
                allowNull: false, // FK → schemes.id (denormalized for reporting)
            },

            installment_no: {
                type: DataTypes.INTEGER,
                allowNull: false, // 1,2,3...12
            },

            installment_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },

            paid_amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },

            payment_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },

            payment_source: {
                type: DataTypes.ENUM("INSTALLMENT", "VOUCHER"),
                allowNull: false,
            },

            receipt_id: {
                type: DataTypes.INTEGER,
                allowNull: true, // FK → voucher_receipts.id
            },

            status: {
                type: DataTypes.ENUM("PAID", "PARTIAL", "FAILED"),
                defaultValue: "PAID",
            },
        },
        {
            timestamps: true,
            paranoid: true,
            underscored: true,
        }
    );

    return CustomerSchemePayment;
};
