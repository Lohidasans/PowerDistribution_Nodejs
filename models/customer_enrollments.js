module.exports = (sequelize, DataTypes) => {
  const Enrollment = sequelize.define(
    "customer_enrollments",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      enrollment_code: { // Auto generate // Scheme code + 6 digit random number
        type: DataTypes.STRING,
        allowNull: true,
      },
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      mobile_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      customer_no: {
        type: DataTypes.STRING, 
        allowNull: false,
        unique: true,
      },
      customer_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      country_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      state_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      district_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      pincode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      scheme_plan_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      installment_amount_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      identity_proof_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      identity_proof_no: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      nominee: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      nominee_relation_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("Active", "Closed", "Completed"),
        allowNull: false,
        defaultValue: "Active",
      },
       is_bill_adjusted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      completed_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      closed_date: {
        type: DataTypes.DATE,
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

  return Enrollment;
};
