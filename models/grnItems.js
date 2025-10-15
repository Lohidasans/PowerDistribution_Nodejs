module.exports = (sequelize, DataTypes) => {
  const GrnItem = sequelize.define(
    "grnItems",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      // Parent GRN
      grn_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // From other master tables (store only IDs)
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
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      purity: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
      },
      ordered_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      received_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      rate: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
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

  return GrnItem;
};
