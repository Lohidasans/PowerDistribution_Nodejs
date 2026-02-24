module.exports = (sequelize, DataTypes) => {
    const Payroll = sequelize.define(
        "payrolls",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            pay_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            branch_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            employee_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            employee_no: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            pay_month: {
                // Stored as "YYYY-MM" e.g. "2026-02"
                type: DataTypes.STRING(7),
                allowNull: false,
            },
            pf_number: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            worked_days: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            absent_days: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            comp_off_days: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            loss_of_pay_days: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            total_earnings: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
                defaultValue: 0,
            },
            total_deductions: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: false,
                defaultValue: 0,
            },
            net_salary: {
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

    Payroll.associate = (models) => {
        Payroll.hasMany(models.PayrollItem, {
            foreignKey: "payroll_id",
            as: "items",
        });
        Payroll.belongsTo(models.Employee, {
            foreignKey: "employee_id",
            as: "employee",
        });
        Payroll.belongsTo(models.Branch, {
            foreignKey: "branch_id",
            as: "branch",
        });
    };

    return Payroll;
};
