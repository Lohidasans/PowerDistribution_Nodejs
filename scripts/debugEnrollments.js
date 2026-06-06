const { Sequelize } = require('sequelize');
const s = new Sequelize('retailERPMAR16', 'etsuser', 'Ets@1234', {
  host: '46.202.160.46', dialect: 'postgres', logging: false
});

async function run() {
  const [result] = await s.query(
    "UPDATE scheme_durations SET months = CAST(REGEXP_REPLACE(duration_name, '[^0-9]', '', 'g') AS INTEGER) WHERE months IS NULL"
  );
  console.log('Update result:', JSON.stringify(result));
  const [rows] = await s.query('SELECT * FROM scheme_durations');
  console.log('scheme_durations:', JSON.stringify(rows, null, 2));
  await s.close();
}
run().catch(e => { console.error(e.message); s.close(); });
