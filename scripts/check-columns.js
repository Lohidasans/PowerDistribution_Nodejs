const { Sequelize } = require("sequelize");

const sequelize = new Sequelize("retailERPLiveUAT", "etsuser", "Ets@1234", {
  host: "46.202.160.46",
  dialect: "postgres",
  logging: false,
});

async function run() {
  try {
    await sequelize.authenticate();
    const [rows] = await sequelize.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns
      WHERE table_name = 'voucher_receipts'
      ORDER BY ordinal_position;
    `);
    console.log("Columns in voucher_receipts:");
    rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await sequelize.close();
  }
}

run();
