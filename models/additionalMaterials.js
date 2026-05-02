module.exports = (sequelize, DataTypes) => {
  const AdditionalMaterial = sequelize.define(
    "additional_materials",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      parent_type: {
        type: DataTypes.ENUM("quotation_item", "po_item", "grn_item"),
        allowNull: false,
      },

      parent_id: { // grn_item_id/po_item_id/quotation_item_id should be passed here
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      label: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      weight_in_g: {
        type: DataTypes.DECIMAL(15, 4),
      },

      value: {
        type: DataTypes.DECIMAL(15, 2),
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

  return AdditionalMaterial;
};