import React, { useEffect, useState } from "react";
import { parseExemplosHtml } from "../utils/examplesParser";

const ExamplesViewer = ({ fileUrl }) => {
  const [cards, setCards] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (!fileUrl) return;
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((html) => {
        const parsed = parseExemplosHtml(html);
        if (parsed.length === 0) {
          setStatus("empty");
          return;
        }
        setCards(parsed);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        setStatus("error");
      });
  }, [fileUrl]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Carregando exemplos...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg text-red-400 mb-2">Erro ao carregar exemplos</div>
          <div className="text-sm text-slate-500 mb-4">Algo deu errado ao buscar o conteudo.</div>
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Nenhum exemplo encontrado
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-950 px-6 py-6">
      <div className="max-w-4xl mx-auto">
        {cards.map((c) => (
          <div
            key={c.id}
            className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-4"
          >
            <h2 className="text-slate-100 font-semibold text-lg mb-4">
              {c.title}
            </h2>
            <div
              className="text-slate-300 text-sm leading-relaxed prose-embedded"
              dangerouslySetInnerHTML={{ __html: c.content }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExamplesViewer;
