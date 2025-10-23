module.exports = (sequelize, DataTypes) => {
  const Scheme = sequelize.define(
    "schemes",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      material_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      scheme_name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      scheme_type: {
        type: DataTypes.ENUM("Weight Based", "Value Based"),
        allowNull: false,
      },
      duration: {
        type: DataTypes.ENUM("6 Months", "12 Months"),
        allowNull: false,
      },
      monthly_installments: {
        type: DataTypes.ARRAY(DataTypes.DECIMAL(15, 2)),
        allowNull: true,
      },
      payment_frequency: {
        type: DataTypes.ENUM("Monthly", "Quarterly", "Half Yearly", "Yearly"),
        allowNull: false,
      },
      min_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      redemption: {
        type: DataTypes.ENUM("Jewellery", "Coins", "Bars"),
        allowNull: false,
      },
      visible_to: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM("Active", "Inactive"),
        allowNull: false,
        defaultValue: "Active",
      },
      terms_and_conditions_url: {
        type: DataTypes.TEXT,
        allowNull: true
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

  Scheme.associate = (models) => {
    // material_type_id references materialTypes
    // branches array is not a direct association; use manual joins when needed
  };

  return Scheme;
};
