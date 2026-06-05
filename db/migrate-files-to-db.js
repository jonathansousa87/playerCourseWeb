// Migra arquivos .md e .txt de flashcards existentes no filesystem para o banco.
// Executa com: node db/migrate-files-to-db.js
// Apos a migracao os arquivos locais sao apagados.
import 'dotenv/config';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import pg from 'pg';

const { Pool } = pg;
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL nao definida'); process.exit(1); }

const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL.includes('.supabase.co') ? { rejectUnauthorized: false } : false,
});

const COURSES_PATH = process.env.COURSES_PATH;
if (!COURSES_PATH) { console.error('COURSES_PATH nao definida'); process.exit(1); }

// Importa parseAnkiFlashcards do modulo de flashcards
const { parseAnkiFlashcards } = await import('../server/flashcards.js');

// Patterns de materiais por kind
const PATTERNS = [
  { kind: 'resumo',   regex: /_resumo_dub_\d+(?:_ia)?\.md$/i },
  { kind: 'quiz',     regex: /_quiz_dub_\d+(?:_ia)?\.(?:html|md)$/i },
  { kind: 'exemplos', regex: /_exemplos_dub_\d+(?:_ia)?\.(?:html|md)$/i },
  { kind: 'diario',   regex: /_diario_tecnico_dub_\d+(?:_ia)?\.md$/i },
];

const FLASHCARD_PATTERN = /_flashcards_anki_dub_\d+(?:_ia)?\.txt$/i;

// Extrai lessonPrefix (tudo antes do primeiro sufixo _X_dub)
const extractPrefix = (filename) => {
  const m = filename.match(/^(.+?)(?:_resumo_dub|_quiz_dub|_exemplos_dub|_diario_tecnico_dub|_flashcards_anki_dub)/i);
  return m ? m[1] : null;
};

let inserted = 0, deleted = 0, errors = 0;

const processDir = async (dir, courseTitle) => {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }

  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { await processDir(full, courseTitle); continue; }

    // Verifica se é um material .md
    for (const { kind, regex } of PATTERNS) {
      if (!regex.test(e.name)) continue;
      const prefix = extractPrefix(e.name);
      if (!prefix) continue;
      try {
        const content = await fs.readFile(full, 'utf8');
        await pool.query(
          `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (course_title, lesson_prefix, kind)
           DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
          [courseTitle, prefix, kind, content],
        );
        await fs.unlink(full);
        console.log(`  [${kind}] ${e.name} → banco ✓`);
        inserted++; deleted++;
      } catch (err) {
        console.error(`  [${kind}] ${e.name}: ERRO — ${err.message}`);
        errors++;
      }
      break;
    }

    // Verifica se é um .txt de flashcards já importado (apaga se existe deck no banco)
    if (FLASHCARD_PATTERN.test(e.name)) {
      const prefix = extractPrefix(e.name);
      if (!prefix) continue;
      try {
        const { rows } = await pool.query(
          'SELECT id FROM flashcard_decks WHERE course_title = $1 AND lesson_prefix = $2 LIMIT 1',
          [courseTitle, prefix],
        );
        if (rows.length > 0) {
          await fs.unlink(full);
          console.log(`  [flashcards-txt] ${e.name} → apagado (deck existe no banco)`);
          deleted++;
        }
      } catch (err) {
        console.error(`  [flashcards-txt] ${e.name}: ${err.message}`);
      }
    }
  }
};

const run = async () => {
  console.log(`Migrando materiais de ${COURSES_PATH} para o banco...\n`);
  const courses = await fs.readdir(COURSES_PATH, { withFileTypes: true });
  for (const c of courses) {
    if (!c.isDirectory()) continue;
    const courseTitle = c.name;
    console.log(`Curso: ${courseTitle}`);
    await processDir(join(COURSES_PATH, courseTitle), courseTitle);
  }
  console.log(`\nConcluido: ${inserted} materiais salvos no banco, ${deleted} arquivos apagados, ${errors} erros.`);
  await pool.end();
};

run().catch((err) => { console.error(err.message); process.exit(1); });
