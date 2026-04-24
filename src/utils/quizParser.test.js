// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseQuizHtml } from './quizParser.js';

const makeCard = ({ title, options, explanation = '' }) => `
<div class="question-card">
  <h3 class="question-title">${title}</h3>
  ${options
    .map(
      (o) =>
        `<button class="answer-btn" data-correct="${o.correct ? 'true' : 'false'}">${o.text}</button>`,
    )
    .join('\n  ')}
  ${explanation ? `<div class="explanation">${explanation}</div>` : ''}
</div>`;

const wrap = (body) =>
  `<!DOCTYPE html><html><body><div class="container">${body}</div></body></html>`;

describe('parseQuizHtml', () => {
  it('extrai uma questao com 4 opcoes e identifica a correta', () => {
    const html = wrap(
      makeCard({
        title: 'Qual o protocolo?',
        options: [
          { text: 'HTTP', correct: true },
          { text: 'FTP', correct: false },
          { text: 'SMTP', correct: false },
          { text: 'SSH', correct: false },
        ],
        explanation: 'HTTP serve paginas web.',
      }),
    );

    const [q] = parseQuizHtml(html);

    expect(q.id).toBe(1);
    expect(q.question).toBe('Qual o protocolo?');
    expect(q.options).toHaveLength(4);
    expect(q.options[0]).toEqual({ text: 'HTTP', correct: true });
    expect(q.options.filter((o) => o.correct)).toHaveLength(1);
    expect(q.explanation).toBe('HTTP serve paginas web.');
  });

  it('numera questoes sequencialmente a partir de 1', () => {
    const html = wrap([
      makeCard({
        title: 'P1',
        options: [
          { text: 'a', correct: true },
          { text: 'b', correct: false },
        ],
      }),
      makeCard({
        title: 'P2',
        options: [
          { text: 'a', correct: false },
          { text: 'b', correct: true },
        ],
      }),
      makeCard({
        title: 'P3',
        options: [
          { text: 'a', correct: true },
          { text: 'b', correct: false },
        ],
      }),
    ].join(''));

    const qs = parseQuizHtml(html);
    expect(qs.map((q) => q.id)).toEqual([1, 2, 3]);
  });

  it('remove numero prefixado no titulo (ex "1. Pergunta")', () => {
    const html = wrap(
      makeCard({
        title: '1. Qual o nome?',
        options: [{ text: 'X', correct: true }],
      }),
    );
    const [q] = parseQuizHtml(html);
    expect(q.question).toBe('Qual o nome?');
  });

  it('ignora cards sem .question-title OU sem .answer-btn', () => {
    const html = wrap(`
      <div class="question-card">
        <button class="answer-btn" data-correct="true">So o botao</button>
      </div>
      <div class="question-card">
        <h3 class="question-title">So o titulo</h3>
      </div>
    `);
    expect(parseQuizHtml(html)).toEqual([]);
  });

  it('retorna array vazio se nao ha .question-card', () => {
    expect(parseQuizHtml('<html><body><p>nada</p></body></html>')).toEqual([]);
  });

  it('explanation ausente vira string vazia (nao null)', () => {
    const html = wrap(
      makeCard({
        title: 'P sem explicacao',
        options: [
          { text: 'a', correct: true },
          { text: 'b', correct: false },
        ],
      }),
    );
    const [q] = parseQuizHtml(html);
    expect(q.explanation).toBe('');
  });

  it('normaliza whitespace nos textos das opcoes', () => {
    const html = wrap(`
      <div class="question-card">
        <h3 class="question-title">  Pergunta  </h3>
        <button class="answer-btn" data-correct="true">
          Opcao com
          quebras
        </button>
      </div>
    `);
    const [q] = parseQuizHtml(html);
    expect(q.question).toBe('Pergunta');
    expect(q.options[0].text).toContain('Opcao com');
  });
});
