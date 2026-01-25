module.exports = (sequelize, DataTypes) => {
  const DeliveryChellan = sequelize.define(
    "delivery_chellan",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },

      delivery_challan_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },

      delivery_challan_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      vendor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      ref_no: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      amount_in_words: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      sub_total: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      sgst: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      cgst: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      igst: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      discount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      total_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },

      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
          tableName: "delivery_chellan",      // ✅ exact table name
      freezeTableName: true,    
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  return DeliveryChellan;
};
