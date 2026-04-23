import { describe, it, expect } from 'vitest';
import { parseAnkiFlashcards } from './flashcardParser.js';

describe('parseAnkiFlashcards', () => {
  describe('formato 1: tab-separated (canonico)', () => {
    it('parseia 3 cards com tabs reais', () => {
      const txt = [
        '#separator:tab',
        '#html:true',
        'O que e HTTP?\tProtocolo de transmissao',
        'Para que serve o DNS?\tResolucao de nomes',
        'Qual a funcao do TCP?\tEntrega ordenada',
      ].join('\n');

      const cards = parseAnkiFlashcards(txt);

      expect(cards).toHaveLength(3);
      expect(cards[0]).toEqual({
        front: 'O que e HTTP?',
        back: 'Protocolo de transmissao',
      });
      expect(cards[2]).toEqual({
        front: 'Qual a funcao do TCP?',
        back: 'Entrega ordenada',
      });
    });

    it('ignora linhas que comecam com #', () => {
      const txt = '#separator:tab\n#html:true\npergunta\tresposta';
      expect(parseAnkiFlashcards(txt)).toHaveLength(1);
    });

    it('remove HTML da pergunta e resposta', () => {
      const txt = '<b>Qual</b> a cor?\t<b>Azul</b> claro';
      const [card] = parseAnkiFlashcards(txt);
      expect(card).toEqual({ front: 'Qual a cor?', back: 'Azul claro' });
    });
  });

  describe('formato 2: <b> inline parcial', () => {
    it('extrai quando resposta esta envolta em <b> no meio da linha', () => {
      const txt = 'O que e HTTP? <b>Protocolo de transmissao</b> na web';
      const [card] = parseAnkiFlashcards(txt);
      expect(card.front).toBe('O que e HTTP?');
      expect(card.back).toContain('Protocolo de transmissao');
      expect(card.back).toContain('na web');
    });

    it('funciona quando nao ha texto apos </b>', () => {
      const txt = 'Qual a capital? <b>Brasilia</b>';
      const [card] = parseAnkiFlashcards(txt);
      expect(card).toEqual({ front: 'Qual a capital?', back: 'Brasilia' });
    });
  });

  describe('formato 3: multi-espacos (fallback IA)', () => {
    it('aceita 4+ espacos como separador quando nao ha tab', () => {
      const txt = 'Qual a funcao do TCP?    Entrega ordenada de pacotes';
      const [card] = parseAnkiFlashcards(txt);
      expect(card).toEqual({
        front: 'Qual a funcao do TCP?',
        back: 'Entrega ordenada de pacotes',
      });
    });

    it('nao separa com apenas 1-3 espacos (evita falso positivo)', () => {
      const txt = 'Frase simples sem separador claro aqui';
      const cards = parseAnkiFlashcards(txt);
      // Cai no fallback colon? Nao tem dois-pontos. Deve retornar vazio.
      expect(cards).toHaveLength(0);
    });
  });

  describe('formato 4: "Pergunta: resposta" (fallback colon)', () => {
    it('parseia linha com dois-pontos', () => {
      const txt = 'O que e um protocolo: um conjunto de regras de comunicacao';
      const [card] = parseAnkiFlashcards(txt);
      expect(card.front).toContain('protocolo');
      expect(card.back).toBe('um conjunto de regras de comunicacao');
    });

    it('adiciona ? no final da pergunta se nao tiver pontuacao', () => {
      const txt = 'O que e DNS: servico de resolucao de nomes';
      const [card] = parseAnkiFlashcards(txt);
      expect(card.front).toMatch(/\?$/);
    });

    it('nao quebra texto corrido com dois-pontos no meio', () => {
      // Frases curtas (< 5 chars antes do ':') devem ser rejeitadas
      const txt = 'Ex: isso nao deve virar card';
      expect(parseAnkiFlashcards(txt)).toHaveLength(0);
    });

    it('aceita dois-pontos fullwidth japones', () => {
      const txt = 'Qual o protocolo：HTTP';
      const [card] = parseAnkiFlashcards(txt);
      expect(card).toBeDefined();
      expect(card.back).toBe('HTTP');
    });
  });

  describe('resiliencia geral', () => {
    it('retorna array vazio pra input vazio', () => {
      expect(parseAnkiFlashcards('')).toEqual([]);
    });

    it('descarta linhas em branco', () => {
      const txt = 'pergunta\tresposta\n\n\n\nsegunda\tresp2';
      expect(parseAnkiFlashcards(txt)).toHaveLength(2);
    });

    it('processa arquivo misto: cabecalho + cards tab + cards com <b>', () => {
      const txt = [
        '#separator:tab',
        '#html:true',
        'pergunta1\tresposta1',
        'pergunta2 <b>resposta2</b>',
        'pergunta3:    resposta3', // multi-space com colon
        'pergunta4    resposta4',
      ].join('\n');
      const cards = parseAnkiFlashcards(txt);
      expect(cards.length).toBeGreaterThanOrEqual(3);
      expect(cards[0].back).toBe('resposta1');
    });

    it('prioriza formato tab sobre outros fallbacks', () => {
      // Linha tem tab E colon — tab tem que ganhar
      const txt = 'pergunta: com colon\tresposta via tab';
      const [card] = parseAnkiFlashcards(txt);
      expect(card.back).toBe('resposta via tab');
    });
  });
});
