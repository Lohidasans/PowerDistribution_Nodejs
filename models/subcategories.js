module.exports = (sequelize, DataTypes) => {
  const Subcategory = sequelize.define(
    "subcategories",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      subcategory_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      subcategory_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
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
      indexes: [
        { unique: true, fields: ["category_id", "subcategory_name"] },
        { fields: ["category_id"] },
      ],
    }
  );

  Subcategory.associate = (models) => {
    if (models.Category)
      Subcategory.belongsTo(models.Category, {
        foreignKey: "category_id",
        as: "category",
      });
  };

  return Subcategory;
};
