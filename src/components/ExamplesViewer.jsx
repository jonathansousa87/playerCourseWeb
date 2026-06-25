import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import MermaidDiagram from "./MermaidDiagram";
import FlowDiagram from "./FlowDiagram";
import CodeBlock from "./CodeBlock";
import remarkGfm from "remark-gfm";
import { parseExemplosHtml, parseExemplosMd } from "../utils/examplesParser";
import { useReadTimer } from "../hooks/useReadTimer";
import { LoadingState, ErrorState } from "./StateViews";

const ExamplesViewer = ({ fileUrl, courseTitle, lessonPrefix }) => {
  const [cards, setCards] = useState([]);
  const [isMd, setIsMd] = useState(false);
  const [status, setStatus] = useState("loading");

  useReadTimer(courseTitle, lessonPrefix, "exemplos");

  useEffect(() => {
    if (!fileUrl) return;
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(text);
        setIsMd(!isHtml);
        const parsed = isHtml ? parseExemplosHtml(text) : parseExemplosMd(text);
        if (parsed.length === 0) { setStatus("empty"); return; }
        setCards(parsed);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        setStatus("error");
      });
  }, [fileUrl]);

  if (status === "loading") {
    return <LoadingState message="Carregando pratica..." />;
  }

  if (status === "error") {
    return <ErrorState message="Erro ao carregar a pratica." />;
  }

  if (status === "empty") {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Nenhuma pratica encontrada
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-950 px-4 lg:px-8 py-6">
      <div className="w-full">
        {cards.map((c) => (
          <div
            key={c.id}
            className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-4"
          >
            <h2 className="text-slate-100 font-semibold text-lg mb-4">{c.title}</h2>
            {isMd ? (
              <div className="text-slate-300 text-sm leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <p className="text-slate-300 text-sm leading-[1.8] mb-3">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="space-y-1.5 my-2 pl-1 [&_li]:text-slate-300 [&_li]:text-sm">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="space-y-1.5 my-2 pl-4 [&_li]:text-slate-300 [&_li]:text-sm">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="flex items-start gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 mt-2 flex-shrink-0" />
                        <span>{children}</span>
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="text-slate-100 font-semibold">{children}</strong>
                    ),
                    code: ({ node, children, ...props }) => {
                      const isInline = !node?.position?.start.line || node?.position?.start.line === node?.position?.end.line;
                      // ```mermaid -> render PADRAO; ```flow -> React Flow (secundario/legado).
                      if (!isInline && /\blanguage-mermaid\b/.test(props.className || "")) {
                        return <MermaidDiagram chart={String(children).replace(/\n$/, "")} />;
                      }
                      if (!isInline && /\blanguage-flow\b/.test(props.className || "")) {
                        return <FlowDiagram spec={String(children).replace(/\n$/, "")} />;
                      }
                      return isInline ? (
                        <code className="text-[12px] font-mono bg-slate-800/70 text-cyan-300 px-1.5 py-0.5 rounded border border-slate-700/40" {...props}>
                          {children}
                        </code>
                      ) : (
                        <CodeBlock className={props.className}>{children}</CodeBlock>
                      );
                    },
                    pre: ({ children }) => <>{children}</>,
                    blockquote: ({ children }) => (
                      <blockquote className="my-3 border-l-4 border-amber-500/50 pl-4 text-slate-400 text-sm italic">
                        {children}
                      </blockquote>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-purple-300 font-medium text-sm mt-4 mb-2">{children}</h3>
                    ),
                    table: ({ children }) => (
                      <div className="my-4 overflow-x-auto">
                        <table className="w-full text-sm border-collapse">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => (
                      <th className="text-left font-semibold text-slate-200 px-3 py-2 border border-slate-700/60 bg-slate-800/40">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 border border-slate-700/40 text-slate-300 align-top">{children}</td>
                    ),
                  }}
                >
                  {c.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div
                className="text-slate-300 text-sm leading-relaxed prose-embedded"
                dangerouslySetInnerHTML={{ __html: c.content }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExamplesViewer;
