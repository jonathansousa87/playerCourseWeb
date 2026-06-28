import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useReadTimer } from "../hooks/useReadTimer";
import { LoadingState } from "./StateViews";
import MermaidDiagram from "./MermaidDiagram";
import FlowDiagram from "./FlowDiagram";
import CodeBlock from "./CodeBlock";
import { regenerateDiagram } from "../utils/progressApi";

const MarkdownViewer = ({ fileUrl, courseTitle, lessonPrefix }) => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  // Tempo de leitura (passivo) — alimenta /api/stats/activity-balance.
  // Sem courseTitle/lessonPrefix, vira no-op (uso fora do contexto de aula).
  useReadTimer(courseTitle, lessonPrefix, "resumo");

  // Regenera SO um diagrama (botao no MermaidDiagram), sem recondensar a aula.
  // Disponivel apenas no contexto de uma aula (curso + prefixo conhecidos).
  const canRegen = !!(courseTitle && lessonPrefix);
  const regenerateBlock = async (oldChart) => {
    const { chart: newChart } = await regenerateDiagram({ courseTitle, lessonPrefix, chart: oldChart });
    // Troca o bloco no conteudo -> ReactMarkdown re-renderiza o diagrama corrigido.
    setContent((c) => c.replace(oldChart, newChart));
  };

  useEffect(() => {
    if (!fileUrl) return;
    setLoading(true);

    fetch(fileUrl)
      .then((res) => res.text())
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar markdown:", err);
        setContent("# Erro ao carregar conteudo");
        setLoading(false);
      });
  }, [fileUrl]);

  if (loading) {
    return <LoadingState message="Carregando resumo..." />;
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="w-full px-4 lg:px-8 py-8">
        <article className="space-y-6">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <div className="bg-gradient-to-r from-blue-600/15 to-indigo-600/15 border border-blue-500/20 rounded-2xl px-6 py-5 mb-8">
                  <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                    {children}
                  </h1>
                </div>
              ),
              h2: ({ children }) => (
                <div className="bg-slate-900/60 border-l-4 border-emerald-500/60 rounded-r-xl px-5 py-4 mt-8 mb-4">
                  <h2 className="text-xl font-semibold text-emerald-300 tracking-tight flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
                    {stripMarkdown(children)}
                  </h2>
                </div>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-medium text-purple-300 mt-6 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-purple-500/60 rounded-full flex-shrink-0" />
                  {stripMarkdown(children)}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-base font-medium text-slate-300 mt-5 mb-2">
                  {children}
                </h4>
              ),
              p: ({ children }) => {
                const isStandalone =
                  typeof children === "string" && children.trim().length > 0;
                return isStandalone ? (
                  <p className="text-slate-300 leading-[1.85] text-[15px] mb-4">
                    {children}
                  </p>
                ) : (
                  <p className="text-slate-300 leading-[1.7] text-[15px] mb-3">
                    {children}
                  </p>
                );
              },
              ul: ({ children }) => (
                <ul className="space-y-2 my-3 pl-1 [&_li]:text-slate-300 [&_li]:leading-[1.7]">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="space-y-2 my-3 pl-4 [&_li]:text-slate-300 [&_li]:leading-[1.7]">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="flex items-start gap-2.5 text-[15px] mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 mt-2.5 flex-shrink-0" />
                  <span>{children}</span>
                </li>
              ),
              strong: ({ children }) => (
                <strong className="text-slate-100 font-semibold bg-gradient-to-r from-amber-400/10 to-amber-300/10 px-0.5 py-0 rounded-sm">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="text-slate-300 italic not-italic bg-slate-800/40 px-1.5 py-0.5 rounded text-[14px]">
                  {children}
                </em>
              ),
              code: ({ node, children, ...props }) => {
                const isInline = !node?.position?.start.line || node?.position?.start.line === node?.position?.end.line;
                // Bloco ```mermaid -> render PADRAO (a IA emite Mermaid). O
                // MermaidDiagram estiliza flowchart/classes/etc. e redireciona
                // mindmap pro FlowDiagram.
                if (!isInline && /\blanguage-mermaid\b/.test(props.className || "")) {
                  return (
                    <MermaidDiagram
                      chart={String(children).replace(/\n$/, "")}
                      onRegenerate={canRegen ? regenerateBlock : undefined}
                    />
                  );
                }
                // Bloco ```flow -> React Flow (JSON). Mantido no sistema (secundario/
                // legado); o render continua funcionando pros diagramas ja gerados.
                if (!isInline && /\blanguage-flow\b/.test(props.className || "")) {
                  return <FlowDiagram spec={String(children).replace(/\n$/, "")} />;
                }
                return isInline ? (
                  <code
                    className="text-[13px] font-mono bg-slate-800/70 text-cyan-300 px-1.5 py-0.5 rounded-md border border-slate-700/40"
                    {...props}
                  >
                    {children}
                  </code>
                ) : (
                  <CodeBlock className={props.className}>{children}</CodeBlock>
                );
              },
              pre: ({ children }) => <>{children}</>,
              blockquote: ({ children }) => (
                <blockquote className="my-5 bg-blue-950/15 border-l-4 border-blue-500/50 rounded-r-xl px-5 py-4">
                  <div className="text-slate-300 leading-[1.75] text-[15px] border-l border-blue-400/20 pl-4">
                    {children}
                  </div>
                </blockquote>
              ),
              hr: () => (
                <hr className="my-8 border-slate-700/30" />
              ),
              table: ({ children }) => (
                <div className="my-6 overflow-x-auto rounded-lg border border-slate-700/40">
                  <table className="w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="bg-slate-800/60 text-slate-200 font-semibold border border-slate-700/40 px-4 py-3 text-left">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="text-slate-300 border border-slate-700/30 px-4 py-3">
                  {children}
                </td>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-blue-400 underline underline-offset-2 decoration-blue-400/30 hover:decoration-blue-300/60 hover:text-blue-300 transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              img: ({ src, alt }) =>
                src ? (
                  <img
                    src={src}
                    alt={alt || ""}
                    className="rounded-xl shadow-lg my-6 max-w-full"
                  />
                ) : null,
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
};

const stripMarkdown = (children) => {
  if (typeof children !== "string") return children;
  return children.replace(/[#*`_[\]()]/g, "").trim();
};

export default MarkdownViewer;
