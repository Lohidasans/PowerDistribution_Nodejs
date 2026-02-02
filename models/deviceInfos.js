module.exports = (sequelize, DataTypes) => {
    const DeviceInfo = sequelize.define(
        "device_infos",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            device_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            mac_address: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            devices: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            ip_address: {
                type: DataTypes.STRING,
                allowNull: true,
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
    return DeviceInfo;
};
