module.exports = (sequelize, DataTypes) => {
    const PayrollItem = sequelize.define(
        "payroll_items",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            payroll_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            payroll_master_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            // 'earning' or 'deduction'
            item_type: {
                type: DataTypes.ENUM("earning", "deduction"),
                allowNull: false,
            },
            amount: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
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

    PayrollItem.associate = (models) => {
        PayrollItem.belongsTo(models.Payroll, {
            foreignKey: "payroll_id",
            as: "payroll",
        });
        PayrollItem.belongsTo(models.PayrollMaster, {
            foreignKey: "payroll_master_id",
            as: "payroll_master",
        });
    };

    return PayrollItem;
};
