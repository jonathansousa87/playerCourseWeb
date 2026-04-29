// Helpers puros pra detectar arquivos de transcricao (.txt/.vtt) que sao
// pareados com um video na mesma pasta. Mantidos separados pra ficarem
// testaveis sem mockar Express/fs.

// Remove a extensao final + locale opcional (ex: .pt-BR, .en, .pt) de um
// arquivo .txt ou .vtt. Retorna o basename "compativel" com o nome do
// video.
//
// Ex: "aula01_dub.pt-BR.txt"  -> "aula01_dub"
//     "aula01_dub.txt"        -> "aula01_dub"
//     "aula01_dub.vtt"        -> "aula01_dub"
//     "qualquer.outro.txt"    -> "qualquer.outro"  (sem locale, OK)
export const transcriptBaseName = (filename) =>
  filename.replace(/(?:\.[a-z]{2,3}(?:-[a-zA-Z]{2,4})?)?\.(txt|vtt)$/i, '');

// True se o filename eh .txt/.vtt cujo basename casa com algum video da
// pasta. videoBasenames eh um Set com os nomes dos videos sem a extensao
// (ex: "aula01_dub" em vez de "aula01_dub.mp4").
export const isTranscriptOfVideo = (filename, videoBasenames) => {
  if (!/\.(txt|vtt)$/i.test(filename)) return false;
  const base = transcriptBaseName(filename);
  return videoBasenames.has(base);
};
