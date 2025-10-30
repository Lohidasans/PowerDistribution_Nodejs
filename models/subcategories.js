const materialType = require("./materialTypes");

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
      materialtype_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
      reorder_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
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
    }
  );

  return Subcategory;
};
