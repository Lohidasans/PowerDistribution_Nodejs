module.exports = (sequelize, DataTypes) => {
  const ProductAdditionalDetail = sequelize.define(
    "productAdditionalDetails",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      item_detail_id: {// belongs to a specific item row
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      label_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      actual_weight: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      weight: {  
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      is_visible: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
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

  return ProductAdditionalDetail;
};
