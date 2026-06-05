import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://playercourse:playercourse_dev@localhost:5433/playercourse';

// SSL obrigatorio para Supabase (e qualquer host remoto)
const ssl = connectionString.includes('.supabase.co')
  ? { rejectUnauthorized: false }
  : false;

export const pool = new Pool({ connectionString, ssl });

pool.on('error', (err) => {
  console.error('Erro inesperado no pool Postgres:', err);
});

export const query = (text, params) => pool.query(text, params);

export async function ensureReady() {
  try {
    const { rows } = await pool.query('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  } catch (err) {
    console.error('Falha ao conectar no Postgres:', err.message);
    return false;
  }
}
