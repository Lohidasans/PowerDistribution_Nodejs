module.exports = (sequelize, DataTypes) => {
    const Employee = sequelize.define(
        "employees",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            profile_image_url: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            employee_no: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            employee_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            department_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            designation_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            joining_date: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            employment_type: {
                type: DataTypes.ENUM("Full-Time", "Part-Time", "Contract"),
                allowNull: false,
            },
            gender: {
                type: DataTypes.ENUM("Male", "Female", "Other"),
                allowNull: false,
            },
            date_of_birth: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            branch_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            status: {
                type: DataTypes.ENUM("Active", "Inactive"),
                allowNull: false,
                defaultValue: "Active",
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
            indexes: [{ fields: ["employee_no"] }],
        }
    );

    Employee.associate = (models) => {
        Employee.belongsTo(models.Branch, {
            foreignKey: "branch_id",
            as: "branch",
        });
        Employee.belongsTo(models.EmployeeDepartment, {
          foreignKey: "department_id",
          as: "department",
        });
        Employee.belongsTo(models.EmployeeDesignation, {
          foreignKey: "designation_id",
          as: "designation",
        });
        Employee.hasOne(models.EmployeeContact, {
            foreignKey: "employee_id",
            as: "contact",
        });
        Employee.hasMany(models.EmployeeExperience, {
            foreignKey: "employee_id",
            as: "experiences",
        });
    }

    return Employee;
};
