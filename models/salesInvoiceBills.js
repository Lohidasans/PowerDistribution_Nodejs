module.exports = (sequelize, DataTypes) => {
  const SalesInvoiceBill = sequelize.define(
    "sales_invoice_bills",
    {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: DataTypes.INTEGER,
      },
      estimate_bill_id: {  // Reference to Estimate Bill if converted
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      invoice_no: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      invoice_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      invoice_time: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      branch_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      net_total: { //sum of the items totals  --> newly added
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      subtotal_amount: { // net total - discount
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      cgst_percent: {
        type: DataTypes.DECIMAL(6, 3),
        allowNull: true,
      },
      sgst_percent: {
        type: DataTypes.DECIMAL(6, 3),
        allowNull: true,
      },
      igst_percent: {
        type: DataTypes.DECIMAL(6, 3),
        allowNull: true,
      },
      cgst_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sgst_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      igst_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      discount_type: {
        type: DataTypes.ENUM("Amount", "Percentage"),
        allowNull: true,
      },
      discount_amount: {  // amount = discount/1.03  , percentage(5)= (5% of total_amount)/1.03
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        defaultValue: 0,
      },
      discount_calculated: {  // discount/1.03
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        defaultValue: 0,
      },
      total_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      amount_due: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      refund_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
      },
      total_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      hasBillAdjustment: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      amount_in_words: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // ── GSTR-1 classification snapshot (populated at invoice save time) ──
      customer_gstin: { // invoice-time GSTIN; null/blank => unregistered (B2C)
        type: DataTypes.STRING,
        allowNull: true,
      },
      place_of_supply: { // state name snapshot, e.g. "Tamil Nadu"
        type: DataTypes.STRING,
        allowNull: true,
      },
      place_of_supply_code: { // state code snapshot, e.g. "TN"
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_export: { // drives the EXP tab
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      export_type: { // export with/without payment of tax
        type: DataTypes.ENUM("With Payment", "Without Payment"),
        allowNull: true,
      },
      reverse_charge: { // drives reverse-charge flag on B2B
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      supply_type: { // drives the EXEMP tab
        type: DataTypes.ENUM("Taxable", "Exempt", "Nil Rated", "Non GST"),
        allowNull: false,
        defaultValue: "Taxable",
      },
      gstr1_category: { // resolved bucket, computed from the fields above
        type: DataTypes.ENUM("B2B", "B2CL", "B2CS", "EXP", "EXEMP"),
        allowNull: true,
      },

      status: {
        type: DataTypes.ENUM("Draft", "Printed", "Invoice", "Cancelled", "On Hold"),
        allowNull: false,
        defaultValue: "Draft",
      },
      order_type: {
        type: DataTypes.ENUM("Online", "Offline"),
        allowNull: false,
        defaultValue: "Offline",
      },
      stock_deducted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

  return SalesInvoiceBill;
};
