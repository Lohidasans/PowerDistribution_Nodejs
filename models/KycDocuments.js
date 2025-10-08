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
        type: DataTypes.ENUM("branch", "vendor", "employee"),
        allowNull: false,
      },
      entity_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      doc_type: {
        type: DataTypes.STRING, // PAN, GST, AADHAAR, MSME, OTHER
        allowNull: false,
      },
      doc_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      file_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      issued_on: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expires_on: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
