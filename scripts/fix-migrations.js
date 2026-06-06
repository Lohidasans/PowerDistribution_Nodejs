const { Sequelize } = require("sequelize");

const sequelize = new Sequelize("retailERPLiveUAT", "etsuser", "Ets@1234", {
  host: "46.202.160.46",
  dialect: "postgres",
  logging: console.log,
});

async function run() {
  try {
    await sequelize.authenticate();
    console.log("Connected to DB.");

    // 1. Mark the already-run migration as done in SequelizeMeta
    await sequelize.query(
      `INSERT INTO "SequelizeMeta" (name) VALUES ('20260330000001-create-employee-attendance-reports.js') ON CONFLICT DO NOTHING;`
    );
    console.log("SequelizeMeta updated.");

    // 2. Add reference_type column if it doesn't exist
    const [rtRows] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'voucher_receipts' AND column_name = 'reference_type'
    `);
    if (rtRows.length === 0) {
      await sequelize.query(`ALTER TABLE voucher_receipts ADD COLUMN reference_type VARCHAR(20) NULL;`);
      console.log("Added reference_type column.");
    } else {
      console.log("reference_type column already exists.");
    }

    // 3. Add reference_id column if it doesn't exist
    const [riRows] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'voucher_receipts' AND column_name = 'reference_id'
    `);
    if (riRows.length === 0) {
      await sequelize.query(`ALTER TABLE voucher_receipts ADD COLUMN reference_id INTEGER NULL;`);
      console.log("Added reference_id column.");
    } else {
      console.log("reference_id column already exists.");
    }

    // 4. Mark our new migration as done in SequelizeMeta too
    await sequelize.query(
      `INSERT INTO "SequelizeMeta" (name) VALUES ('20260331000001-add-reference-columns-to-voucher-receipts.js') ON CONFLICT DO NOTHING;`
    );
    console.log("New migration marked as done in SequelizeMeta.");

    console.log("Done!");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await sequelize.close();
  }
}

run();
