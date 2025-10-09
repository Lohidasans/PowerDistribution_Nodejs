module.exports = (sequelize, DataTypes) => {
  const Uom = sequelize.define(
    "uoms",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      uom_code: {
        type: DataTypes.STRING,  // Visible UOM ID in UI (e.g., UOM001)
        allowNull: false,
        unique: true,
      },
      uom_name: {
        type: DataTypes.STRING,// e.g., grams, kilograms
        allowNull: false,
      },
      short_code: {
        type: DataTypes.STRING,// e.g., gm, kg, pcs
        allowNull: false,
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
        { unique: true, fields: ["uom_code"] },
        { unique: true, fields: ["uom_name", "short_code"] },
      ],
    }
  );

  return Uom;
};
