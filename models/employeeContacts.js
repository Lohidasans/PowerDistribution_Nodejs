module.exports = (sequelize, DataTypes) => {
    const EmployeeContact = sequelize.define(
        "employee_contacts",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            employee_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            mobile_number: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            email_id: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            address: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            country_id: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            state_id: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            district_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            pin_code: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            emergency_contact_person: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            relationship: {
                type: DataTypes.ENUM("Father", "Mother", "Guardian"),
                allowNull: false,
            },
            emergency_contact_number: {
                type: DataTypes.STRING,
                allowNull: false,
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: "updated_at",
            paranoid: true,
            deletedAt: "deleted_at",
            indexes: [{ fields: ["employee_id"] }],
        }
    );
    return EmployeeContact;
};
