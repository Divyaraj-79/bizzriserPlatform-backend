
const { Client } = require('pg');

const connectionString = 'postgresql://bizzriserplatform_db_user:F1uE2Nnqx8mOOWoySBQxDoEJs4YzBG8W@dpg-d761hcma2pns73fmcm2g-a.oregon-postgres.render.com/bizzriserplatform_db?ssl=true';

async function test() {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting with pg client...');
    await client.connect();
    console.log('Connected!');
    const res = await client.query('SELECT NOW()');
    console.log('Result:', res.rows[0]);
    await client.end();
  } catch (err) {
    console.error('Connection error', err.stack);
  }
}

test();
