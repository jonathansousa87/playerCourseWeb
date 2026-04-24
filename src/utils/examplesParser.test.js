// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseExemplosHtml } from './examplesParser.js';

const wrap = (body) =>
  `<!DOCTYPE html><html><body>${body}</body></html>`;

describe('parseExemplosHtml', () => {
  it('extrai cards com h2 + conteudo', () => {
    const html = wrap(`
      <div class="card">
        <h2>Conceito A</h2>
        <p>explicacao A</p>
      </div>
      <div class="card">
        <h2>Conceito B</h2>
        <p>explicacao B</p>
      </div>
    `);

    const cards = parseExemplosHtml(html);
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toBe('Conceito A');
    expect(cards[1].title).toBe('Conceito B');
    expect(cards[0].content).toContain('explicacao A');
    expect(cards[0].content).not.toContain('<h2>'); // titulo removido do content
  });

  it('id sequencial a partir de 1', () => {
    const html = wrap(`
      <div class="card"><h2>A</h2><p>1</p></div>
      <div class="card"><h2>B</h2><p>2</p></div>
      <div class="card"><h2>C</h2><p>3</p></div>
    `);
    const cards = parseExemplosHtml(html);
    expect(cards.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('aceita h1 como titulo quando nao ha h2', () => {
    const html = wrap('<div class="card"><h1>Titulo H1</h1><p>body</p></div>');
    const [card] = parseExemplosHtml(html);
    expect(card.title).toBe('Titulo H1');
  });

  it('gera titulo fallback quando nao ha h1/h2', () => {
    const html = wrap(`
      <div class="card"><p>sem titulo 1</p></div>
      <div class="card"><p>sem titulo 2</p></div>
    `);
    const cards = parseExemplosHtml(html);
    expect(cards[0].title).toBe('Conceito principal');
    expect(cards[1].title).toBe('Conceito 1');
  });

  it('preserva HTML do conteudo (pre, code, ul)', () => {
    const html = wrap(`
      <div class="card">
        <h2>Codigo</h2>
        <pre><code>const x = 1;</code></pre>
        <ul><li>item</li></ul>
      </div>
    `);
    const [card] = parseExemplosHtml(html);
    expect(card.content).toContain('<pre>');
    expect(card.content).toContain('<code>const x = 1;</code>');
    expect(card.content).toContain('<ul>');
  });

  it('retorna array vazio se nao ha .card', () => {
    expect(parseExemplosHtml('<html><body><p>vazio</p></body></html>')).toEqual([]);
  });

  it('ignora conteudo fora de .card', () => {
    const html = wrap(`
      <p>antes</p>
      <div class="card"><h2>Dentro</h2><p>x</p></div>
      <div>outro div sem class</div>
    `);
    const cards = parseExemplosHtml(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Dentro');
  });
});
