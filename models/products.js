module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define(
    "products",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      product_code: {
        type: DataTypes.STRING, // e.g., PRD_001
        allowNull: true,
        unique: true,
      },
      ref_no_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      product_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_published: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      image_urls: {
        type: DataTypes.ARRAY(DataTypes.STRING),// Images (bulk)
        allowNull: true,
      },
      qr_image_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      vendor_id: {
        type: DataTypes.INTEGER, // from vendor table
        allowNull: false,
      },
      material_type_id: {
        type: DataTypes.INTEGER, // from materialType table
        allowNull: false,
      },
      category_id: {
        type: DataTypes.INTEGER, // from categories table
        allowNull: false,
      },
      subcategory_id: {
        type: DataTypes.INTEGER, // from subcategories table
        allowNull: false,
      },
      grn_id: {
        type: DataTypes.INTEGER, // from grn table
        allowNull: false,
      },
      branch_id: {
        type: DataTypes.INTEGER, // from brnach table
        allowNull: true,
      },
      // Product info
      sku_id: { // auto generate in backend
        type: DataTypes.STRING,
        allowNull: true,
      },
      hsn_code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      purity: {
        type: DataTypes.DECIMAL(10, 3), // e.g., 92.5
        allowNull: false,
      },
      product_type: {
        type: DataTypes.ENUM("Weight Based", "Piece Rate"),
        allowNull: false,
      },
      variation_type: {
        type: DataTypes.ENUM("Without Variations", "With Variations"),
        allowNull: false,
      },
      product_variations: {
        type: DataTypes.TEXT,//variation: "[name: finish, values: [regualr, Gold]]"
        allowNull: true,
      },
      is_addOn: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Summary details
      total_grn_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      total_products: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      remaining_weight: {
        type: DataTypes.DECIMAL(15, 3),
        allowNull: true,
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

  return Product;
};
