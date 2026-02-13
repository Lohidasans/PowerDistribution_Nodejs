module.exports = (sequelize, DataTypes) => {
    const EnrollDeviceDetails = sequelize.define(
        "enroll_device_details",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            device_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            user_id: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            user_type: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            enroll_type: {
                type: DataTypes.STRING,
                allowNull: true,
            },
        },
        {
            tableName: "enroll_device_details",
            timestamps: false,
            paranoid: false
        }
    );

    return EnrollDeviceDetails;
};
