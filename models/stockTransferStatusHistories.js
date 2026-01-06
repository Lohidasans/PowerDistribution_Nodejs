module.exports = (sequelize, DataTypes) => {
    const StockTransferStatusHistory = sequelize.define(
        "stock_transfer_status_histories",
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
            status_id: {//Whenever status changes in Figma UI - Update current status and insert a history record
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            updated_by: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            remarks: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
        },
        {
            timestamps: true,
            createdAt: "created_at",
            updatedAt: false,
            paranoid: false,
        }
    );

    return StockTransferStatusHistory;
};
