import express from 'express';
import { query } from '../../db/index.js';

const router = express.Router();

const dec = (s) => decodeURIComponent(s);

// GET /api/materials/:course/:prefix/:kind
// Retorna o conteudo em texto puro para o viewer no frontend.
router.get('/api/materials/:course/:prefix/:kind', async (req, res) => {
  const { course, prefix, kind } = req.params;
  try {
    const { rows } = await query(
      'SELECT content FROM lesson_materials WHERE course_title = $1 AND lesson_prefix = $2 AND kind = $3',
      [dec(course), dec(prefix), kind],
    );
    if (!rows[0]) return res.status(404).send('Material nao encontrado');
    res.type('text/plain; charset=utf-8').send(rows[0].content);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GET /api/materials-by-kind/:course/:kind — lista as aulas (lesson_prefix) que
// tem aquele material no curso. Usado pela tela de revisao (aba Diario tecnico).
// Base distinta de /api/materials/... pra nao colidir com /:course/:prefix/:kind.
router.get('/api/materials-by-kind/:course/:kind', async (req, res) => {
  const { course, kind } = req.params;
  try {
    const { rows } = await query(
      'SELECT lesson_prefix, updated_at FROM lesson_materials WHERE course_title = $1 AND kind = $2 ORDER BY lesson_prefix',
      [dec(course), kind],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/materials/:course/:prefix  — lista os kinds disponíveis no DB
router.get('/api/materials/:course/:prefix', async (req, res) => {
  const { course, prefix } = req.params;
  try {
    const { rows } = await query(
      'SELECT kind, updated_at FROM lesson_materials WHERE course_title = $1 AND lesson_prefix = $2',
      [dec(course), dec(prefix)],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/materials/:course/:prefix/:kind  — salva/atualiza conteudo (usado pelo diario via editor)
router.put('/api/materials/:course/:prefix/:kind', async (req, res) => {
  const { course, prefix, kind } = req.params;
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'content obrigatorio' });
  try {
    await query(
      `INSERT INTO lesson_materials (course_title, lesson_prefix, kind, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (course_title, lesson_prefix, kind)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [dec(course), dec(prefix), kind, content],
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/materials/:course  — apaga TODO o material gerado do curso no banco.
// Remove apenas conteudo gerado (resumo/quiz/exemplos/diario/piada em
// lesson_materials, decks de flashcards e pre-questoes). NAO mexe em
// progresso, anotacoes do aluno, nem nos arquivos do curso no Drive/disco.
router.delete('/api/materials/:course', async (req, res) => {
  const course = dec(req.params.course);
  try {
    const materials = await query(
      'DELETE FROM lesson_materials WHERE course_title = $1',
      [course],
    );
    // flashcards e flashcard_reviews caem em cascata via FK do deck.
    const decks = await query(
      'DELETE FROM flashcard_decks WHERE course_title = $1',
      [course],
    );
    const prequestions = await query(
      'DELETE FROM lesson_prequestions WHERE course_title = $1',
      [course],
    );
    res.json({
      ok: true,
      deleted: {
        materials: materials.rowCount,
        flashcardDecks: decks.rowCount,
        prequestions: prequestions.rowCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
