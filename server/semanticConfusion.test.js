import { describe, it, expect } from 'vitest';
import {
  tokenize,
  jaccardSimilarity,
  findConfusionGroups,
} from './semanticConfusion.js';

describe('tokenize', () => {
  it('quebra em palavras minusculas', () => {
    expect(tokenize('O QUE eh HTTP?')).toEqual(['http']);
  });

  it('remove stopwords PT', () => {
    const tokens = tokenize('O que é um protocolo de rede?');
    expect(tokens).not.toContain('que');
    expect(tokens).not.toContain('um');
    expect(tokens).not.toContain('de');
    expect(tokens).toContain('protocolo');
    expect(tokens).toContain('rede');
  });

  it('remove acentos', () => {
    const tokens = tokenize('função Configuração');
    expect(tokens).toContain('funcao');
    expect(tokens).toContain('configuracao');
  });

  it('descarta palavras com <= 2 caracteres', () => {
    const tokens = tokenize('eu vi ao ar');
    expect(tokens).toEqual([]);
  });

  it('retorna array vazio para input null/undefined', () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });
});

describe('jaccardSimilarity', () => {
  it('identicos -> 1', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('completamente diferentes -> 0', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('meio sobreposto', () => {
    // |inter| = 1 (b), |union| = 3 (a,b,c) -> 1/3
    const sim = jaccardSimilarity(['a', 'b'], ['b', 'c']);
    expect(sim).toBeCloseTo(1 / 3, 5);
  });

  it('arrays vazios -> 0 (sem dividir por zero)', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
    expect(jaccardSimilarity([], ['a'])).toBe(0);
  });

  it('duplicatas na entrada nao inflam similarity', () => {
    // "a a b" vs "a b" — sets {a,b} vs {a,b} = 1
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });
});

describe('findConfusionGroups', () => {
  const card = (id, front, lapses = 2) => ({ id, front, lapses });

  it('agrupa cards com fronts similares que tem lapsos suficientes', () => {
    const cards = [
      card(1, 'O que e TCP no modelo OSI', 3),
      card(2, 'O que e UDP no modelo OSI', 3),
      card(3, 'Para que serve o DNS na internet', 3),
      card(4, 'Qual a cor do ceu', 3),
    ];
    const groups = findConfusionGroups(cards, { threshold: 0.3, minLapses: 2 });
    // 1 e 2 compartilham modelo+osi; 3 tem internet/dns; 4 isolado
    expect(groups.length).toBe(1);
    const ids = groups[0].cards.map((c) => c.id).sort();
    expect(ids).toEqual([1, 2]);
  });

  it('filtra por minLapses', () => {
    const cards = [
      card(1, 'Mesma pergunta aqui', 5),
      card(2, 'Mesma pergunta aqui', 0), // zero lapsos, filtrado
    ];
    const groups = findConfusionGroups(cards, { threshold: 0.3, minLapses: 2 });
    expect(groups).toEqual([]);
  });

  it('retorna vazio se menos de 2 cards passam no filtro', () => {
    const cards = [card(1, 'qualquer coisa', 5)];
    expect(findConfusionGroups(cards, { minLapses: 2 })).toEqual([]);
  });

  it('ordena grupos por totalLapses desc', () => {
    const cards = [
      // grupo A: 2 cards com 10 lapsos cada = 20
      card(1, 'Como funciona o HTTP no browser', 10),
      card(2, 'Como funciona o HTTPS no browser', 10),
      // grupo B: 2 cards com 3 lapsos cada = 6
      card(3, 'Para que serve o cache DNS', 3),
      card(4, 'Para que serve o cache do DNS', 3),
    ];
    const groups = findConfusionGroups(cards, { threshold: 0.3, minLapses: 2 });
    expect(groups.length).toBe(2);
    expect(groups[0].totalLapses).toBe(20); // grupo A primeiro
    expect(groups[1].totalLapses).toBe(6);
  });

  it('componentes conexos transitivos (union-find)', () => {
    // A ~ B (classe+heranca) e B ~ C (polimorfismo+atributo), mas A !~ C direto
    // O union-find deve ainda assim juntar os tres.
    const cards = [
      card(1, 'classe objeto instancia heranca', 3),
      card(2, 'classe heranca polimorfismo atributo', 3),
      card(3, 'polimorfismo atributo metodo interface', 3),
    ];
    const groups = findConfusionGroups(cards, { threshold: 0.3, minLapses: 2 });
    expect(groups.length).toBe(1);
    expect(groups[0].cards.length).toBe(3);
  });

  it('respeita threshold baixo vs alto', () => {
    const cards = [
      card(1, 'protocolo http', 3),
      card(2, 'protocolo https', 3),
    ];
    // threshold baixo: agrupa
    expect(findConfusionGroups(cards, { threshold: 0.2, minLapses: 2 })).toHaveLength(1);
    // threshold alto (0.9): nao agrupa (http != https)
    expect(findConfusionGroups(cards, { threshold: 0.9, minLapses: 2 })).toHaveLength(0);
  });
});
