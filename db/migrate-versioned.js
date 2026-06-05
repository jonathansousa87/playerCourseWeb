// Aplica migrations versionadas em db/migrations/*.sql.
// Cria tabela schema_migrations (filename TEXT PRIMARY KEY, applied_at) e
// pula arquivos ja registrados. Cada arquivo roda em transacao propria — o
// .sql nao deve conter BEGIN/COMMIT.
import 'dotenv/config';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

const ensureTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const run = async () => {
  let files;
  try {
    files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('Diretorio db/migrations/ nao existe — nada a aplicar.');
      return;
    }
    throw err;
  }
  if (files.length === 0) {
    console.log('Sem migrations para aplicar.');
    return;
  }

  const client = await pool.connect();
  try {
    await ensureTable(client);
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`SKIP ${file} (ja aplicada)`);
        continue;
      }
      const sql = await fs.readFile(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`APPLY ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        appliedCount += 1;
        console.log(`OK    ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Falha em ${file}: ${err.message}`);
      }
    }

    if (appliedCount === 0) {
      console.log('Banco ja esta atualizado.');
    } else {
      console.log(`Migrations aplicadas: ${appliedCount}.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((err) => {
  console.error('Falha:', err.message);
  process.exit(1);
});
