
const { Client } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_IPmpMxe36VNn@ep-little-snow-a18ngv0q-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function test() {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to Neon with pg client...');
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
