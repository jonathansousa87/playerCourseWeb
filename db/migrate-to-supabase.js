// Migra dados do Postgres local para o Supabase.
// Executa com: node db/migrate-to-supabase.js
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const LOCAL = 'postgres://playercourse:playercourse_dev@localhost:5433/playercourse';
const REMOTE = process.env.SUPABASE_DATABASE_URL;

if (!REMOTE) {
  console.error('SUPABASE_DATABASE_URL nao definida no .env');
  process.exit(1);
}

const src = new Pool({ connectionString: LOCAL });
const dst = new Pool({ connectionString: REMOTE, ssl: { rejectUnauthorized: false } });

// Ordem respeita FKs: pai antes de filho.
const TABLES = [
  'users',
  'lesson_progress',
  'step_completions',
  'personal_notes',
  'pomodoro_sessions',
  'weekly_diaries',
  'flashcard_decks',
  'flashcards',
  'flashcard_reviews',
  'flashcard_review_log',
  'quiz_attempts',
  'technical_diary_notes',
  'lesson_prequestions',
  'prequestion_attempts',
  'view_sessions',
  'lesson_chats',
];

const migrateTable = async (table) => {
  const { rows } = await src.query(`SELECT * FROM ${table}`);
  if (rows.length === 0) {
    console.log(`  ${table}: vazia, pulando`);
    return;
  }

  // Trunca destino antes de inserir (permite rerun idempotente)
  await dst.query(`TRUNCATE TABLE ${table} CASCADE`);

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');

  let inserted = 0;
  for (const row of rows) {
    const vals = cols.map((_, i) => `$${i + 1}`).join(', ');
    // Serializa objetos JS (JSONB lido pelo driver) de volta para string JSON
    const values = cols.map((c) => {
      const v = row[c];
      if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
        return JSON.stringify(v);
      }
      return v;
    });
    await dst.query(`INSERT INTO ${table} (${colList}) VALUES (${vals})`, values);
    inserted++;
  }

  // Reseta a sequence do BIGSERIAL para alem do max id inserido
  try {
    if (cols.includes('id')) {
      await dst.query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table}`,
      );
    }
  } catch {
    // tabela sem sequence (sem coluna id serial) — ignora
  }

  console.log(`  ${table}: ${inserted} linhas migradas`);
};

const run = async () => {
  console.log('Iniciando migracao local → Supabase...\n');
  for (const table of TABLES) {
    try {
      await migrateTable(table);
    } catch (err) {
      console.error(`  ${table}: ERRO — ${err.message}`);
    }
  }
  console.log('\nMigracao concluida.');
  await src.end();
  await dst.end();
};

run().catch((err) => {
  console.error('Falha fatal:', err.message);
  process.exit(1);
});
