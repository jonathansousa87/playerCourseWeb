// Testes unitarios da logica de DB + FSRS em server/flashcards.js.
// Mockam o modulo `../db/index.js` pra evitar conexao real no Postgres; a
// lib `ts-fsrs` roda pra valer (ela eh pura). Cobrem dedup, filtros de SQL,
// mapeamento de rating, branch novo-vs-existente em reviewCard, e o
// requirement de userId em todas as funcoes.

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  query: vi.fn(),
  ensureReady: vi.fn(),
}));

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

const USER = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userId obrigatorio', () => {
  it('reviewCard rejeita sem userId', async () => {
    await expect(reviewCard({ cardId: 1, rating: 3 })).rejects.toThrow(/userId obrigatorio/);
  });
  it('importDeck rejeita sem userId', async () => {
    await expect(importDeck({ coursesPath: '/c', courseTitle: 'X', lessonPrefix: 'p' }))
      .rejects.toThrow(/userId obrigatorio/);
  });
  it('getDeck rejeita sem userId', async () => {
    await expect(getDeck({ courseTitle: 'X', lessonPrefix: 'p' })).rejects.toThrow(/userId obrigatorio/);
  });
  it('getDueCards rejeita sem userId', async () => {
    await expect(getDueCards()).rejects.toThrow(/userId obrigatorio/);
  });
  it('getDueSummary rejeita sem userId', async () => {
    await expect(getDueSummary()).rejects.toThrow(/userId obrigatorio/);
  });
});

describe('reviewCard', () => {
  it('rejeita rating fora do range 1..4', async () => {
    await expect(reviewCard({ userId: USER, cardId: 1, rating: 0 })).rejects.toThrow(/rating invalido/);
    await expect(reviewCard({ userId: USER, cardId: 1, rating: 5 })).rejects.toThrow(/rating invalido/);
    await expect(reviewCard({ userId: USER, cardId: 1, rating: 'foo' })).rejects.toThrow(/rating invalido/);
  });

  it('rejeita card que nao pertence ao usuario (CARD_NOT_FOUND)', async () => {
    // 1ª query: ownership check retorna vazio
    query.mockResolvedValueOnce({ rows: [] });
    await expect(reviewCard({ userId: USER, cardId: 1, rating: 3 }))
      .rejects.toMatchObject({ code: 'CARD_NOT_FOUND' });
  });

  it('card novo (sem review anterior) - usa emptyCard, stateBefore = 0', async () => {
    // 1ª query: ownership check passa
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    // 2ª query: SELECT prev reviews -> vazio (card novo)
    query.mockResolvedValueOnce({ rows: [] });
    // 3ª query: INSERT/UPDATE em flashcard_reviews
    query.mockResolvedValueOnce({ rows: [] });
    // 4ª query: INSERT em flashcard_review_log
    query.mockResolvedValueOnce({ rows: [] });

    const result = await reviewCard({ userId: USER, cardId: 42, rating: 3 });

    expect(query).toHaveBeenCalledTimes(4);
    expect(result.cardId).toBe(42);
    expect(typeof result.state).toBe('number');
    expect(result.due).toBeInstanceOf(Date);
    expect(result.reps).toBeGreaterThanOrEqual(1);

    // Log eh a 4ª chamada (idx 3); rating original (1..4) e state_before sao
    // os 3o e 4o params (depois de cardId e userId).
    const logCall = query.mock.calls[3];
    expect(logCall[0]).toMatch(/flashcard_review_log/);
    expect(logCall[1][2]).toBe(3); // rating
    expect(logCall[1][3]).toBe(0); // state_before = 0 (card novo)
  });

  it('card existente - usa state do row anterior como stateBefore', async () => {
    const now = new Date('2026-04-01T10:00:00Z');
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // ownership
    query.mockResolvedValueOnce({
      rows: [
        {
          state: 2,
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

    const result = await reviewCard({ userId: USER, cardId: 99, rating: 4, now });

    expect(result.cardId).toBe(99);
    expect(result.reps).toBeGreaterThanOrEqual(5);

    const logCall = query.mock.calls[3];
    expect(logCall[1][2]).toBe(4); // rating Easy
    expect(logCall[1][3]).toBe(2); // state_before = Review
  });

  it('mapeia rating 1=Again: lapses incrementa em card maduro', async () => {
    query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // ownership
    query.mockResolvedValueOnce({
      rows: [
        {
          state: 2,
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

    const result = await reviewCard({ userId: USER, cardId: 1, rating: 1 });
    expect(result.lapses).toBeGreaterThan(0);
  });
});

describe('getDueCards', () => {
  it('sem courseTitle - params = [now, limit, userId]', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const out = await getDueCards({ userId: USER });

    expect(out).toEqual([{ id: 1 }]);
    const [sql, params] = query.mock.calls[0];
    expect(params).toHaveLength(3);
    expect(params[1]).toBe(50);
    expect(params[2]).toBe(USER);
    expect(sql).toMatch(/d\.user_id = \$3/);
    expect(sql).not.toMatch(/course_title = \$4/);
  });

  it('com courseTitle - params.length = 4', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await getDueCards({ userId: USER, courseTitle: 'Curso X', limit: 10 });

    const [sql, params] = query.mock.calls[0];
    expect(params).toHaveLength(4);
    expect(params[1]).toBe(10);
    expect(params[2]).toBe(USER);
    expect(params[3]).toBe('Curso X');
    expect(sql).toMatch(/course_title = \$4/);
  });
});

describe('getDueSummary', () => {
  it('retorna rows com params = [now, userId]', async () => {
    const sample = [{ course_title: 'X', total: 10, due: 3 }];
    query.mockResolvedValueOnce({ rows: sample });

    const out = await getDueSummary({ userId: USER });
    expect(out).toEqual(sample);
    const [, params] = query.mock.calls[0];
    expect(params).toHaveLength(2);
    expect(params[0]).toBeInstanceOf(Date);
    expect(params[1]).toBe(USER);
  });
});

describe('getDeck', () => {
  it('retorna null quando deck nao existe', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const out = await getDeck({ userId: USER, courseTitle: 'X', lessonPrefix: 'pre' });
    expect(out).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    // primeira query filtra por user_id
    expect(query.mock.calls[0][1]).toEqual([USER, 'X', 'pre']);
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

    const out = await getDeck({ userId: USER, courseTitle: 'X', lessonPrefix: 'pre' });
    expect(out.deckId).toBe(7);
    expect(out.cards).toHaveLength(2);
    expect(out.cards[0].front).toBe('P1');
  });
});

describe('importDeck', () => {
  const TAB = '\t';

  it('lanca NO_FLASHCARD_FILE quando nenhum arquivo eh encontrado', async () => {
    fs.readdir.mockResolvedValue([]);
    await expect(
      importDeck({ userId: USER, coursesPath: '/c', courseTitle: 'X', lessonPrefix: 'pre' }),
    ).rejects.toMatchObject({ code: 'NO_FLASHCARD_FILE' });
  });

  it('lanca EMPTY_DECK quando arquivo existe mas parser retorna 0 cards', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'pre_flashcards_anki_dub_01.txt', isDirectory: () => false },
    ]);
    fs.readFile.mockResolvedValue('#separator:tab\n#html:true\n');

    await expect(
      importDeck({ userId: USER, coursesPath: '/c', courseTitle: 'X', lessonPrefix: 'pre' }),
    ).rejects.toMatchObject({ code: 'EMPTY_DECK' });
  });

  it('dedup: nao reinsere cards com front+back ja existentes no deck', async () => {
    fs.readdir.mockResolvedValue([
      { name: 'pre_flashcards_anki_dub_01.txt', isDirectory: () => false },
    ]);
    fs.readFile.mockResolvedValue(
      `#separator:tab\n#html:true\nP1${TAB}R1\nP2${TAB}R2\nP3${TAB}R3\n`,
    );

    query.mockResolvedValueOnce({ rows: [{ id: 10 }] });
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, front: 'P1', back: 'R1' },
        { id: 2, front: 'P2', back: 'R2' },
      ],
    });
    query.mockResolvedValueOnce({ rows: [] });

    const out = await importDeck({
      userId: USER,
      coursesPath: '/c',
      courseTitle: 'X',
      lessonPrefix: 'pre',
    });

    expect(out).toEqual({ deckId: 10, total: 3, inserted: 1 });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toMatch(/INSERT INTO flashcards/);
    // INSERT recebe [user_id, deck_id, front, back]
    expect(query.mock.calls[2][1]).toEqual([USER, 10, 'P3', 'R3']);
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
      userId: USER,
      coursesPath: '/c',
      courseTitle: 'X',
      lessonPrefix: 'pre',
    });

    const readFilePath = fs.readFile.mock.calls[0][0];
    expect(readFilePath).toMatch(/_ia\.txt$/);
  });

  it('anda recursivamente em subdiretorios ate achar o arquivo', async () => {
    fs.readdir.mockResolvedValueOnce([
      { name: 'modulo-1', isDirectory: () => true },
    ]);
    fs.readdir.mockResolvedValueOnce([
      { name: 'pre_flashcards_anki_dub_01.txt', isDirectory: () => false },
    ]);
    fs.readFile.mockResolvedValue(`P${TAB}R\n`);
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });

    const out = await importDeck({
      userId: USER,
      coursesPath: '/c',
      courseTitle: 'X',
      lessonPrefix: 'pre',
    });

    expect(out.inserted).toBe(1);
    expect(fs.readdir).toHaveBeenCalledTimes(2);
  });
});
