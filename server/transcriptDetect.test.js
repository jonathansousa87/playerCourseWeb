import { describe, it, expect } from 'vitest';
import { transcriptBaseName, isTranscriptOfVideo } from './transcriptDetect.js';

describe('transcriptBaseName', () => {
  it('remove .txt sem locale', () => {
    expect(transcriptBaseName('aula01_dub.txt')).toBe('aula01_dub');
  });

  it('remove .vtt sem locale', () => {
    expect(transcriptBaseName('aula01_dub.vtt')).toBe('aula01_dub');
  });

  it('remove .pt-BR.txt (locale com regiao)', () => {
    expect(transcriptBaseName('aula01_dub.pt-BR.txt')).toBe('aula01_dub');
  });

  it('remove .pt.txt (locale curto)', () => {
    expect(transcriptBaseName('001 57 - Delimiter_dub.pt.txt')).toBe('001 57 - Delimiter_dub');
  });

  it('remove .en-US.vtt (locale ingles)', () => {
    expect(transcriptBaseName('lesson_dub.en-US.vtt')).toBe('lesson_dub');
  });

  it('preserva nome se nao for .txt/.vtt', () => {
    // funcao nao aplica regex se a extensao final nao bater
    expect(transcriptBaseName('aula.md')).toBe('aula.md');
  });
});

describe('isTranscriptOfVideo', () => {
  const videos = new Set(['aula01_dub', '002 58 Iniciando_dub']);

  it('reconhece .pt-BR.txt como transcricao do video', () => {
    expect(isTranscriptOfVideo('aula01_dub.pt-BR.txt', videos)).toBe(true);
  });

  it('reconhece .txt sem locale como transcricao', () => {
    expect(isTranscriptOfVideo('aula01_dub.txt', videos)).toBe(true);
  });

  it('reconhece .vtt como transcricao (formato legado)', () => {
    expect(isTranscriptOfVideo('aula01_dub.vtt', videos)).toBe(true);
  });

  it('aceita nomes com espacos e numeros', () => {
    expect(isTranscriptOfVideo('002 58 Iniciando_dub.pt-BR.txt', videos)).toBe(true);
  });

  it('NAO reconhece .txt cujo nome NAO bate com nenhum video', () => {
    // Esse eh o caso critico: .txt que eh aula de verdade (ex: notas em texto)
    expect(isTranscriptOfVideo('exercicios_extras.txt', videos)).toBe(false);
    expect(isTranscriptOfVideo('README.txt', videos)).toBe(false);
  });

  it('NAO reconhece .md/.mp4/etc (nao termina em txt/vtt)', () => {
    expect(isTranscriptOfVideo('aula01_dub.md', videos)).toBe(false);
    expect(isTranscriptOfVideo('aula01_dub.mp4', videos)).toBe(false);
  });

  it('Set vazio: nada eh transcricao', () => {
    expect(isTranscriptOfVideo('aula01_dub.txt', new Set())).toBe(false);
  });
});
