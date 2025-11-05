module.exports = (sequelize, DataTypes) => {
    const Module = sequelize.define(
        'modules',
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            module_group_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            module_name: { //Dashboard, Customer, Saving Scheme(Inside the General Module Group)
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
        }
    );
    return Module;
};
