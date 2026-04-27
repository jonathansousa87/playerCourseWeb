import express from 'express';
import { query } from '../../db/index.js';
import { generateForLesson } from '../ai/generator.js';
import { chatWithLesson } from '../ai/chat.js';
import { DEFAULT_MODEL as DEEPSEEK_DEFAULT_MODEL } from '../ai/deepseek.js';
import { getCoursesPath } from '../config.js';

const router = express.Router();

const ALLOWED_KINDS = new Set(['resumo', 'quiz', 'flashcards', 'diario', 'exemplos']);

router.post('/api/ia/generate', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix, kinds, model } = req.body || {};
    if (!courseTitle || !lessonPrefix) {
      return res.status(400).json({ error: 'courseTitle e lessonPrefix obrigatorios' });
    }
    const wanted = Array.isArray(kinds) ? kinds : [];
    const filtered = wanted.filter((k) => ALLOWED_KINDS.has(k));
    if (filtered.length === 0) {
      return res.status(400).json({
        error: `kinds invalidos. Use subset de: ${[...ALLOWED_KINDS].join(', ')}`,
      });
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'DEEPSEEK_API_KEY nao configurada no .env' });
    }
    const out = await generateForLesson({
      coursesPath: getCoursesPath(),
      courseTitle,
      lessonPrefix,
      kinds: filtered,
      model: model || DEEPSEEK_DEFAULT_MODEL,
    });
    res.json(out);
  } catch (err) {
    const code =
      err.code === 'NO_TRANSCRIPT' || err.code === 'NO_LESSON_DIR'
        ? 404
        : err.code === 'EMPTY_TRANSCRIPT'
          ? 422
          : 500;
    res.status(code).json({ error: err.message, code: err.code });
  }
});

// Histórico do chat de uma aula (ordem cronológica)
router.get('/api/ia/chat/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const { rows } = await query(
      `SELECT id, role, content, created_at
       FROM lesson_chats
       WHERE course_title = $1 AND lesson_prefix = $2
       ORDER BY created_at ASC, id ASC`,
      [decodeURIComponent(courseTitle), decodeURIComponent(lessonPrefix)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Limpa todo o historico do chat dessa aula
router.delete('/api/ia/chat/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    await query(
      `DELETE FROM lesson_chats WHERE course_title = $1 AND lesson_prefix = $2`,
      [decodeURIComponent(courseTitle), decodeURIComponent(lessonPrefix)],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Envia uma nova mensagem do user, persiste pergunta + resposta no DB.
// Body: { courseTitle, lessonPrefix, message: string, model? }
// O historico anterior eh carregado do DB pra dar contexto ao modelo.
router.post('/api/ia/chat', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix, message, model } = req.body || {};
    if (!courseTitle || !lessonPrefix) {
      return res.status(400).json({ error: 'courseTitle e lessonPrefix obrigatorios' });
    }
    const userContent = String(message || '').trim();
    if (!userContent) {
      return res.status(400).json({ error: 'message vazia' });
    }

    // Carrega historico previo do DB
    const prev = await query(
      `SELECT role, content FROM lesson_chats
       WHERE course_title = $1 AND lesson_prefix = $2
       ORDER BY created_at ASC, id ASC`,
      [courseTitle, lessonPrefix],
    );

    const messages = [
      ...prev.rows.map((r) => ({ role: r.role, content: r.content })),
      { role: 'user', content: userContent },
    ];

    const out = await chatWithLesson({
      coursesPath: getCoursesPath(),
      courseTitle,
      lessonPrefix,
      messages,
      model: model || DEEPSEEK_DEFAULT_MODEL,
    });

    // Persiste pergunta + resposta. Se a chamada da IA falhou, o catch
    // abaixo captura e nada eh salvo — o usuario tenta de novo.
    const userInsert = await query(
      `INSERT INTO lesson_chats (course_title, lesson_prefix, role, content)
       VALUES ($1, $2, 'user', $3)
       RETURNING id, role, content, created_at`,
      [courseTitle, lessonPrefix, userContent],
    );
    const assistantInsert = await query(
      `INSERT INTO lesson_chats (course_title, lesson_prefix, role, content)
       VALUES ($1, $2, 'assistant', $3)
       RETURNING id, role, content, created_at`,
      [courseTitle, lessonPrefix, out.reply],
    );

    res.json({
      reply: out.reply,
      usage: out.usage,
      model: out.model,
      userMessage: userInsert.rows[0],
      assistantMessage: assistantInsert.rows[0],
    });
  } catch (err) {
    const code =
      err.code === 'NO_TRANSCRIPT'
        ? 404
        : err.code === 'EMPTY_TRANSCRIPT' || err.code === 'BAD_LAST_MESSAGE' || err.code === 'EMPTY_MESSAGES'
          ? 422
          : 500;
    res.status(code).json({ error: err.message, code: err.code });
  }
});

export default router;
