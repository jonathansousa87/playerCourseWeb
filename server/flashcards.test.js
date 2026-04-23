// Testes unitarios da logica de DB + FSRS em server/flashcards.js.
// Mockam o modulo `../db/index.js` pra evitar conexao real no Postgres; a
// lib `ts-fsrs` roda pra valer (ela eh pura). Cobrem dedup, filtros de SQL,
// mapeamento de rating e branch novo-vs-existente em reviewCard.

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Hoisted por vitest — precisa vir antes dos imports de teste.
vi.mock('../db/index.js', () => ({
  query: vi.fn(),
  ensureReady: vi.fn(),
}));

// Mock do fs.promises (usado em importDeck via findFlashcardFile e readFile).
vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

import { promises as fs } from 'fs';
import { query } from '../db/index.js';
import {
  importDeck,
  getDeck,
  getDueCards,
  reviewCard,
  getDueSummary,
} from './flashcards.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reviewCard', () => {
  it('rejeita rating fora do range 1..4', async () => {
    await expect(reviewCard({ cardId: 1, rating: 0 })).rejects.toThrow(
      /rating invalido/,
    );
    await expect(reviewCard({ cardId: 1, rating: 5 })).rejects.toThrow(
      /rating invalido/,
    );
    await expect(reviewCard({ cardId: 1, rating: 'foo' })).rejects.toThrow(
      /rating invalido/,
    );
  });

  it('card novo (sem review anterior) - usa emptyCard, stateBefore = 0', async () => {
    // 1ª query: SELECT prev reviews -> rows vazio (card novo)
    query.mockResolvedValueOnce({ rows: [] });
    // 2ª query: INSERT/UPDATE em flashcard_reviews
    query.mockResolvedValueOnce({ rows: [] });
    // 3ª query: INSERT em flashcard_review_log
    query.mockResolvedValueOnce({ rows: [] });

    const result = await reviewCard({ cardId: 42, rating: 3 });

    expect(query).toHaveBeenCalledTimes(3);
    expect(result.cardId).toBe(42);
    expect(typeof result.state).toBe('number');
    expect(result.due).toBeInstanceOf(Date);
    expect(result.reps).toBeGreaterThanOrEqual(1);

    // Verifica que o log recebe state_before = 0 (card novo)
    const logCall = query.mock.calls[2];
    expect(logCall[0]).toMatch(/flashcard_review_log/);
    expect(logCall[1][2]).toBe(0); // state_before
    expect(logCall[1][1]).toBe(3); // rating original (1..4)
  });

  it('card existente - usa state do row anterior como stateBefore', async () => {
    const now = new Date('2026-04-01T10:00:00Z');
    query.mockResolvedValueOnce({
      rows: [
        {
          state: 2, // Review
          due: new Date('2026-03-25T10:00:00Z'),
          stability: 1.5,
          difficulty: 5.0,
          elapsed_days: 7,
          scheduled_days: 3,
          reps: 4,
          lapses: 1,
          last_review: new Date('2026-03-18T10:00:00Z'),
        },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const result = await reviewCard({ cardId: 99, rating: 4, now });

    expect(result.cardId).toBe(99);
    expect(result.reps).toBeGreaterThanOrEqual(5); // incrementou sobre os 4 prev

    const logCall = query.mock.calls[2];
    expect(logCall[1][2]).toBe(2); // state_before = Review
    expect(logCall[1][1]).toBe(4); // rating Easy
  });

  it('mapeia rating 1=Again: espera-se que lapses incremente em card maduro', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          state: 2, // Review
          due: new Date(),
          stability: 5.0,
          difficulty: 4.0,
          elapsed_days: 10,
          scheduled_days: 5,
          reps: 10,
          lapses: 0,
          last_review: new Date(),
        },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const result = await reviewCard({ cardId: 1, rating: 1 });
    expect(result.lapses).toBeGreaterThan(0);
  });
});

describe('getDueCards', () => {
  it('sem courseTitle - query usa $1 (due) e $2 (limit) apenas', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const out = await getDueCards();

    expect(out).toEqual([{ id: 1 }]);
    const [sql, params] = query.mock.calls[0];
    expect(params).toHaveLength(2); // [now, limit]
    expect(params[1]).toBe(50); // default limit
    expect(sql).not.toMatch(/course_title = \$3/);
  });

  it('com courseTitle - adiciona filtro e params.length = 3', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await getDueCards({ courseTitle: 'Curso X', limit: 10 });

    const [sql, params] = query.mock.calls[0];
    expect(params).toHaveLength(3);
    expect(params[1]).toBe(10);
    expect(params[2]).toBe('Curso X');
    expect(sql).toMatch(/course_title = \$3/);
  });
});

describe('getDueSummary', () => {
  it('retorna as rows do query com $1 = now', async () => {
    const sample = [{ course_title: 'X', total: 10, due: 3 }];
    query.mockResolvedValueOnce({ rows: sample });

    const out = await getDueSummary();
    expect(out).toEqual(sample);
    const [, params] = query.mock.calls[0];
    expect(params).toHaveLength(1);
    expect(params[0]).toBeInstanceOf(Date);
  });
});

describe('getDeck', () => {
  it('retorna null quando deck nao existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const out = await getDeck({ courseTitle: 'X', lessonPrefix: 'pre' });
    expect(out).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('retorna deck + cards quando existe', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 7, imported_at: new Date('2026-04-01') }],
    });
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, front: 'P1', back: 'R1' },
        { id: 2, front: 'P2', back: 'R2' },
      ],
    });

    const out = await getDeck({ courseTitle: 'X', lessonPrefix: 'pre' });
    expect(out.deckId).toBe(7);
    expect(out.cards).toHaveLength(2);
    expect(out.cards[0].front).toBe('P1');
  });
});

describe('importDeck', () => {
  const TAB = '\t';

  it('lanca NO_FLASHCARD_FILE quando nenhum arquivo eh encontrado', async () => {
    fs.readdir.mockResolvedValue([]); // diretorio vazio

    await expect(
      importDeck({ coursesPath: '/c', courseTitle: 'X', lessonPrefix: 'pre' }),
    ).rejects.toMatchObject({ code: 'NO_FLASHCARD_FILE' });
  });

  it('lanca EMPTY_DECK quando arquivo existe mas parser retorna 0 cards', async () => {
    // Primeira readdir retorna o arquivo; readFile retorna conteudo sem cards.
    fs.readdir.mockResolvedValue([
      { name: 'pre_flashcards_anki_dub_01.txt', isDirectory: () => false },
    ]);
    fs.readFile.mockResolvedValue('#separator:tab\n#html:true\n'); // so cabecalhos

    await expect(
      importDeck({ coursesPath: '/c', courseTitle: 'X', lessonPrefix: 'pre' }),
    ).rejects.toMatchObject({ code: 'EMPTY_DECK' });
  });

  it('dedup: nao reinsere cards com front+back ja existentes no deck', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'pre_flashcards_anki_dub_01.txt', isDirectory: () => false },
    ]);
    fs.readFile.mockResolvedValue(
      `#separator:tab\n#html:true\nP1${TAB}R1\nP2${TAB}R2\nP3${TAB}R3\n`,
    );

    // 1) upsert deck retorna id
    query.mockResolvedValueOnce({ rows: [{ id: 10 }] });
    // 2) existing cards - P1/R1 e P2/R2 ja existem
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, front: 'P1', back: 'R1' },
        { id: 2, front: 'P2', back: 'R2' },
      ],
    });
    // 3) insert de P3 - so 1 vez
    query.mockResolvedValueOnce({ rows: [] });

    const out = await importDeck({
      coursesPath: '/c',
      courseTitle: 'X',
      lessonPrefix: 'pre',
    });

    expect(out).toEqual({ deckId: 10, total: 3, inserted: 1 });
    // 3 chamadas total: upsert deck + select existing + 1 insert (dedup funcionou)
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toMatch(/INSERT INTO flashcards/);
    expect(query.mock.calls[2][1]).toEqual([10, 'P3', 'R3']);
  });

  it('prioriza arquivo _ia quando existem variante manual e ia', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'pre_flashcards_anki_dub_01.txt', isDirectory: () => false },
      { name: 'pre_flashcards_anki_dub_02_ia.txt', isDirectory: () => false },
    ]);
    fs.readFile.mockResolvedValue(`#separator:tab\nP${TAB}R\n`);
    query.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    await importDeck({
      coursesPath: '/c',
      courseTitle: 'X',
      lessonPrefix: 'pre',
    });

    // O readFile deve ter sido chamado com o _ia.txt
    const readFilePath = fs.readFile.mock.calls[0][0];
    expect(readFilePath).toMatch(/_ia\.txt$/);
  });

  it('anda recursivamente em subdiretorios ate achar o arquivo', async () => {
    // primeiro readdir: so subpasta
    fs.readdir.mockResolvedValueOnce([
      { name: 'modulo-1', isDirectory: () => true },
    ]);
    // segundo readdir (dentro da subpasta): arquivo alvo
    fs.readdir.mockResolvedValueOnce([
      { name: 'pre_flashcards_anki_dub_01.txt', isDirectory: () => false },
    ]);
    fs.readFile.mockResolvedValue(`P${TAB}R\n`);
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const out = await importDeck({
      coursesPath: '/c',
      courseTitle: 'X',
      lessonPrefix: 'pre',
    });

    expect(out.inserted).toBe(1);
    expect(fs.readdir).toHaveBeenCalledTimes(2);
  });
});
