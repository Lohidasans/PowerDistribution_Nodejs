module.exports = (sequelize, DataTypes) => {
  const KycDocument = sequelize.define(
    "kycDocuments",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      entity_type: {
        type: DataTypes.ENUM("branch", "vendor", "employee","superadmin"),
        allowNull: true,
      },
      entity_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      doc_type: {
        type: DataTypes.STRING, // PAN, GST, AADHAAR, MSME, OTHER
        allowNull: true,
      },
      doc_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      file_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
      indexes: [
        { fields: ["entity_type", "entity_id"] },
        { fields: ["doc_type"] },
      ],
    }
  );

  return KycDocument;
};
