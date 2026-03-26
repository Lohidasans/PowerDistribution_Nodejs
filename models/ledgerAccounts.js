module.exports = (sequelize, DataTypes) => {
    const LedgerAccount = sequelize.define(
        "ledger_accounts",
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            account_name: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            normal_balance: {
                type: DataTypes.ENUM("Debit", "Credit"),
                allowNull: false,
            },
            status_id: {
                type: DataTypes.INTEGER,
                defaultValue: 1,
            }
        },
        {
            tableName: "ledger_accounts",
            timestamps: true,
            paranoid: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            deletedAt: "deleted_at",
        }
    );

    return LedgerAccount;
};