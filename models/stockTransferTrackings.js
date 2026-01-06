module.exports = (sequelize, DataTypes) => {
    const StockTransferTracking = sequelize.define(
        "stock_transfer_trackings",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },

            stock_transfer_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            // Dispatch details
            total_packages: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            total_weight: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: true,
            },
            dispatch_date: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            transporter_name: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            vehicle_no: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            tracking_number: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            attach_bill_url: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            tracking_remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            // Delivery details
            delivered_date: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            received_by: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            received_weight: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: true,
            },
            received_packages: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            delivery_remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
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

    return StockTransferTracking;
};
