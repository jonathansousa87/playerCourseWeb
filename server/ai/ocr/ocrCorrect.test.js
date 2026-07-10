import { describe, it, expect } from 'vitest';
import { correctTranscriptWithOcr } from './ocrCorrect.mjs';

// Vocabulario minimo reaproveitado nos casos de nome de projeto (RasmooPlus).
const rasmoo = ['rasmooplus', 'rasmoo', 'RasmooPlusApplication', 'RasPayApplication', 'raspay'];

const correctedText = (transcript, vocabulary) => correctTranscriptWithOcr(transcript, vocabulary).text;

describe('correctTranscriptWithOcr — nome de projeto falado em 2 palavras', () => {
  it('junta "Hasmo Plus" e corrige pro nome canonico sem sufixo de classe', () => {
    const t = 'Hoje vamos falar do projeto Hasmo Plus.';
    expect(correctedText(t, rasmoo)).toBe('Hoje vamos falar do projeto RasmooPlus.');
  });

  it('corrige outras grafias garbled da mesma marca', () => {
    expect(correctedText('o projeto Rasmul Plus', rasmoo)).toBe('o projeto RasmooPlus');
    expect(correctedText('nosso RAS Plus de hoje', rasmoo)).toBe('nosso RasmooPlus de hoje');
  });
});

describe('correctTranscriptWithOcr — bigramas genericos (classe/arquivo em 2 palavras)', () => {
  it('junta "Application Properties" -> application.properties', () => {
    const vocab = ['application.properties'];
    const t = 'Vamos abrir o Application Properties do projeto.';
    expect(correctedText(t, vocab)).toBe('Vamos abrir o application.properties do projeto.');
  });

  it('junta "Docker Compose" -> docker-compose', () => {
    const vocab = ['docker-compose'];
    const t = 'Agora sobe o Docker Compose.';
    expect(correctedText(t, vocab)).toBe('Agora sobe o docker-compose.');
  });

  it('junta "dto getId" -> dto.getId', () => {
    const vocab = ['dto.getId'];
    const t = 'Aqui chamamos o dto getId pra pegar o valor.';
    expect(correctedText(t, vocab)).toBe('Aqui chamamos o dto.getId pra pegar o valor.');
  });
});

describe('correctTranscriptWithOcr — regressoes ja vistas em producao (nao pode voltar a acontecer)', () => {
  it('NAO corrige palavra comum isolada so por causa do strip de sufixo (ordem -> Order)', () => {
    const vocab = ['OrderController'];
    const t = 'A ordem dos parametros importa aqui.';
    expect(correctedText(t, vocab)).toBe(t);
  });

  it('NAO corrige palavra comum isolada (produto -> Product)', () => {
    const vocab = ['ProductController'];
    const t = 'Esse produto tem varios atributos.';
    expect(correctedText(t, vocab)).toBe(t);
  });

  it('NAO apaga a segunda palavra quando a primeira ja e o match perfeito (cliente tem -> Cliente)', () => {
    const vocab = ['Cliente'];
    const t = 'O cliente tem varias contas.';
    expect(correctedText(t, vocab)).toBe(t);
  });

  it('NAO apaga a segunda palavra (IntelliJ ele -> IntelliJ)', () => {
    const vocab = ['IntelliJ'];
    const t = 'Abre o IntelliJ ele carrega rapido.';
    expect(correctedText(t, vocab)).toBe(t);
  });

  it('NAO junta palavras que nao sao adjacentes de verdade (Application de Properties)', () => {
    // "de" fica entre as duas — nao pode virar "ApplicationProperties"
    const vocab = ['ApplicationProperties'];
    const t = 'Application de Properties sao coisas diferentes aqui.';
    expect(correctedText(t, vocab)).toBe(t);
  });
});
