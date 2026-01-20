module.exports = (sequelize, DataTypes) => {
    const PayrollMaster = sequelize.define(
        "payroll_masters",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            payroll_master_type_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            pay_type_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            calculation_type_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            payroll_value: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
            },
            branch_id: {
                type: DataTypes.INTEGER,
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
    return PayrollMaster;
};
