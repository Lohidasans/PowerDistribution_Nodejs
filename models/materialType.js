module.exports = (sequelize, DataTypes) => {
    const MaterialType = sequelize.define(
        "materialTypes",
        {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: DataTypes.INTEGER,
            },
            material_image_url: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            material_type: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
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

    return MaterialType;
};
