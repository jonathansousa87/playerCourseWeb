import express from 'express';
import { query } from '../../db/index.js';
import { generateForLesson } from '../ai/generator.js';
import { generateReadingModule } from '../ai/readingCourse.js';
import { chatWithLesson } from '../ai/chat.js';
import { generatePrequestionsForLesson } from '../ai/prequestions.js';
import { DEFAULT_MODEL as DEEPSEEK_DEFAULT_MODEL } from '../ai/deepseek.js';
import { getCoursesPath, getCourseSource } from '../config.js';

const router = express.Router();

const ALLOWED_KINDS = new Set(['resumo', 'quiz', 'flashcards', 'diario', 'exemplos', 'piada']);

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
      userId: req.userId,
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

// Gera o curso de leitura de UM modulo (a IA agrupa as aulas e condensa as
// transcricoes em .txt). So funciona em modo filesystem (escreve em disco).
router.post('/api/ia/reading-course/module', async (req, res) => {
  try {
    if (getCourseSource() === 'drive') {
      return res.status(400).json({
        error: 'Gerar curso de leitura so funciona no modo local (filesystem). Troque COURSE_SOURCE.',
      });
    }
    const { courseTitle, modulePath, moduleTitle, index, model } = req.body || {};
    if (!courseTitle || !modulePath) {
      return res.status(400).json({ error: 'courseTitle e modulePath obrigatorios' });
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'DEEPSEEK_API_KEY nao configurada no .env' });
    }
    const out = await generateReadingModule({
      coursesPath: getCoursesPath(),
      courseTitle,
      modulePath,
      moduleTitle: moduleTitle || modulePath,
      index: Number(index) || 1,
      model: model || DEEPSEEK_DEFAULT_MODEL,
    });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message, code: err.code });
  }
});

// Histórico do chat de uma aula (ordem cronológica) — escopado por usuario.
router.get('/api/ia/chat/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    const { rows } = await query(
      `SELECT id, role, content, created_at
       FROM lesson_chats
       WHERE user_id = $1 AND course_title = $2 AND lesson_prefix = $3
       ORDER BY created_at ASC, id ASC`,
      [req.userId, decodeURIComponent(courseTitle), decodeURIComponent(lessonPrefix)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Limpa todo o historico do chat dessa aula (do usuario logado).
router.delete('/api/ia/chat/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix } = req.params;
    await query(
      `DELETE FROM lesson_chats WHERE user_id = $1 AND course_title = $2 AND lesson_prefix = $3`,
      [req.userId, decodeURIComponent(courseTitle), decodeURIComponent(lessonPrefix)],
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

    const prev = await query(
      `SELECT role, content FROM lesson_chats
       WHERE user_id = $1 AND course_title = $2 AND lesson_prefix = $3
       ORDER BY created_at ASC, id ASC`,
      [req.userId, courseTitle, lessonPrefix],
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

    const userInsert = await query(
      `INSERT INTO lesson_chats (user_id, course_title, lesson_prefix, role, content)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id, role, content, created_at`,
      [req.userId, courseTitle, lessonPrefix, userContent],
    );
    const assistantInsert = await query(
      `INSERT INTO lesson_chats (user_id, course_title, lesson_prefix, role, content)
       VALUES ($1, $2, $3, 'assistant', $4)
       RETURNING id, role, content, created_at`,
      [req.userId, courseTitle, lessonPrefix, out.reply],
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

// === Pre-questoes (Carpenter & Toftness 2017) ===
// Cache de questoes (lesson_prequestions) e' GLOBAL — uma vez geradas,
// todos os usuarios da plataforma reusam (economia de tokens). Apenas as
// tentativas (prequestion_attempts) sao por usuario.

router.get('/api/ia/prequestions/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const courseTitle = decodeURIComponent(req.params.courseTitle);
    const lessonPrefix = decodeURIComponent(req.params.lessonPrefix);

    const cached = await query(
      `SELECT id, questions, generated_at
       FROM lesson_prequestions
       WHERE course_title = $1 AND lesson_prefix = $2`,
      [courseTitle, lessonPrefix],
    );

    if (cached.rows.length === 0) {
      return res.json({ questions: null, lastAttempt: null });
    }

    const lastAttempt = await query(
      `SELECT id, answers, score, total, attempted_at
       FROM prequestion_attempts
       WHERE user_id = $1 AND course_title = $2 AND lesson_prefix = $3
       ORDER BY attempted_at DESC, id DESC
       LIMIT 1`,
      [req.userId, courseTitle, lessonPrefix],
    );

    res.json({
      id: cached.rows[0].id,
      questions: cached.rows[0].questions,
      generatedAt: cached.rows[0].generated_at,
      lastAttempt: lastAttempt.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Geracao das perguntas — escreve no cache global, nao tem user_id.
router.post('/api/ia/prequestions', async (req, res) => {
  try {
    const { courseTitle, lessonPrefix, model } = req.body || {};
    if (!courseTitle || !lessonPrefix) {
      return res.status(400).json({ error: 'courseTitle e lessonPrefix obrigatorios' });
    }
    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: 'DEEPSEEK_API_KEY nao configurada no .env' });
    }

    const out = await generatePrequestionsForLesson({
      coursesPath: getCoursesPath(),
      courseTitle,
      lessonPrefix,
      model: model || DEEPSEEK_DEFAULT_MODEL,
    });

    const inserted = await query(
      `INSERT INTO lesson_prequestions (course_title, lesson_prefix, questions, generated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (course_title, lesson_prefix)
       DO UPDATE SET questions = EXCLUDED.questions, generated_at = EXCLUDED.generated_at
       RETURNING id, questions, generated_at`,
      [courseTitle, lessonPrefix, JSON.stringify(out.questions)],
    );

    res.json({
      id: inserted.rows[0].id,
      questions: inserted.rows[0].questions,
      generatedAt: inserted.rows[0].generated_at,
      usage: out.usage,
      model: out.model,
    });
  } catch (err) {
    const code =
      err.code === 'NO_TRANSCRIPT'
        ? 404
        : err.code === 'EMPTY_TRANSCRIPT' || err.code === 'BAD_JSON' || err.code === 'BAD_SHAPE'
          ? 422
          : 500;
    res.status(code).json({ error: err.message, code: err.code });
  }
});

router.post('/api/ia/prequestions/:courseTitle/:lessonPrefix/attempts', async (req, res) => {
  try {
    const courseTitle = decodeURIComponent(req.params.courseTitle);
    const lessonPrefix = decodeURIComponent(req.params.lessonPrefix);
    const { answers } = req.body || {};

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers precisa ser array nao-vazio' });
    }

    for (const a of answers) {
      if (!Number.isInteger(a.question_idx) || !Number.isInteger(a.selected_idx)) {
        return res.status(400).json({ error: 'cada answer precisa de question_idx e selected_idx inteiros' });
      }
    }

    const score = answers.filter((a) => a.is_correct === true).length;
    const total = answers.length;

    const inserted = await query(
      `INSERT INTO prequestion_attempts (user_id, course_title, lesson_prefix, answers, score, total)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id, answers, score, total, attempted_at`,
      [req.userId, courseTitle, lessonPrefix, JSON.stringify(answers), score, total],
    );

    res.json(inserted.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apaga perguntas (cache global) + tentativas do usuario logado.
router.delete('/api/ia/prequestions/:courseTitle/:lessonPrefix', async (req, res) => {
  try {
    const courseTitle = decodeURIComponent(req.params.courseTitle);
    const lessonPrefix = decodeURIComponent(req.params.lessonPrefix);
    await query(
      `DELETE FROM lesson_prequestions WHERE course_title = $1 AND lesson_prefix = $2`,
      [courseTitle, lessonPrefix],
    );
    await query(
      `DELETE FROM prequestion_attempts WHERE user_id = $1 AND course_title = $2 AND lesson_prefix = $3`,
      [req.userId, courseTitle, lessonPrefix],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
