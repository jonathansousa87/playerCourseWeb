import 'dotenv/config';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const run = async () => {
  const sql = await fs.readFile(join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migracao aplicada (schema.sql).');
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('Falha na migracao:', err);
  process.exit(1);
});
