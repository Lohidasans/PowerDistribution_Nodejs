module.exports = (sequelize, DataTypes) => {
  const QuotationItem = sequelize.define(
    "quotation_items",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      quotation_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      material_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      subcategory_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      product_description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      purity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
      },
      weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.INTEGER,
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
  
  return QuotationItem;
};
