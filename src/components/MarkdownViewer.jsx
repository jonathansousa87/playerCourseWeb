import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Estavel entre renders: passar um array novo a cada render faria o ReactMarkdown
// reconciliar do zero.
const REMARK_PLUGINS = [remarkGfm];
import { useReadTimer } from "../hooks/useReadTimer";
import { LoadingState } from "./StateViews";
import MermaidDiagram from "./MermaidDiagram";
import FlowDiagram from "./FlowDiagram";
import CodeBlock from "./CodeBlock";
import NarrationBar from "./NarrationBar";
import { regenerateDiagram, fetchNarration } from "../utils/progressApi";
import { getMediaUrl } from "../utils/fileUtils";

const MarkdownViewer = ({ fileUrl, courseTitle, lessonPrefix }) => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  // Tempo de leitura (passivo) — alimenta /api/stats/activity-balance.
  // Sem courseTitle/lessonPrefix, vira no-op (uso fora do contexto de aula).
  useReadTimer(courseTitle, lessonPrefix, "resumo");

  // Titulo da aula: a leitura (modo clareza) comeca em "## O nucleo", sem um `#`, entao
  // a pagina ficava sem titulo. Derivamos do prefixo (tira o numero NN da frente).
  const lessonTitle = useMemo(
    () => (lessonPrefix ? lessonPrefix.replace(/^\d+\s*/, "").trim() : ""),
    [lessonPrefix],
  );

  // Regenera SO um diagrama (botao no MermaidDiagram), sem recondensar a aula.
  // Disponivel apenas no contexto de uma aula (curso + prefixo conhecidos).
  const canRegen = !!(courseTitle && lessonPrefix);
  const regenerateBlock = useCallback(async (oldChart) => {
    const { chart: newChart } = await regenerateDiagram({ courseTitle, lessonPrefix, chart: oldChart });
    // Troca o bloco no conteudo -> ReactMarkdown re-renderiza o diagrama corrigido.
    setContent((c) => c.replace(oldChart, newChart));
  }, [courseTitle, lessonPrefix]);

  // ===== Narracao read-along (controle de audio ADITIVO; nao muda o layout) =====
  // A barra de audio fica num componente SEPARADO (NarrationBar): assim o tempo do
  // audio (atualiza ~4x/s) nao re-renderiza a leitura — era isso que fazia os
  // diagramas/mapas piscarem. A sincronia (realce + scroll) e feita no DOM via ref.
  const scrollRef = useRef(null);
  const articleRef = useRef(null);
  const [narration, setNarration] = useState(null);

  const audioSrc = useMemo(
    () => (narration?.audio ? getMediaUrl(courseTitle, narration.audio) : null),
    [narration, courseTitle],
  );

  // Busca a narracao da aula (se existir). Reseta ao trocar de aula.
  useEffect(() => {
    setNarration(null);
    if (!courseTitle || !lessonPrefix) return;
    let cancel = false;
    fetchNarration(courseTitle, lessonPrefix).then((n) => {
      if (!cancel && n?.audio && Array.isArray(n.segments) && n.segments.length) setNarration(n);
    });
    return () => { cancel = true; };
  }, [courseTitle, lessonPrefix]);

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

  // Memoizado por CONTEUDO: enquanto a narracao toca, a NarrationBar (isolada) nao
  // re-renderiza este viewer. Mas quando algo externo re-renderiza (ex.: o auto-
  // complete da aula muda o estado no CoursePlatform), um `components`/plugins
  // recriados inline fariam o ReactMarkdown REMONTAR todos os nos (p/li/h2...). Os
  // nos antigos viram detached e o mapa de scroll da narracao (mapRef) quebra ->
  // a leitura "para de seguir". Memoizando o elemento, o re-render externo nao toca
  // no DOM do artigo e a narracao continua acompanhando.
  const markdownEl = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
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
            <p className="text-slate-300 leading-[2] text-[15px] mb-4">
              {children}
            </p>
          ) : (
            <p className="text-slate-300 leading-[2] text-[15px] mb-3">
              {children}
            </p>
          );
        },
        ul: ({ children }) => (
          <ul className="space-y-2.5 my-3 pl-1 [&_li]:text-slate-300 [&_li]:leading-[1.95]">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="space-y-2.5 my-3 pl-4 [&_li]:text-slate-300 [&_li]:leading-[1.95]">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="flex items-start gap-2.5 text-[15px] mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 mt-3 flex-shrink-0" />
            <span>{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-emerald-200 bg-emerald-500/15 ring-1 ring-emerald-400/20 px-1.5 py-0.5 rounded-md decoration-clone">
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em className="text-slate-300 italic not-italic bg-slate-800/40 px-1.5 py-0.5 rounded text-[14px] decoration-clone">
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
              className="text-[13px] font-mono bg-slate-800/70 text-cyan-300 px-1.5 py-0.5 rounded-md border border-slate-700/40 decoration-clone"
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
  ), [content, canRegen, regenerateBlock]);

  if (loading) {
    return <LoadingState message="Carregando resumo..." />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full px-4 lg:px-8 py-8">
        {/* Titulo da aula (fora do articleRef de proposito: nao entra no mapa da
            narracao nem e realçado). So quando o markdown nao ja traz um `#`. */}
        {lessonTitle && !/^\s*#\s/.test(content) && (
          <div className="mb-7 pb-4 border-b border-slate-800/60">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              Leitura da aula
            </div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight leading-tight">
              {lessonTitle}
            </h1>
          </div>
        )}
        <article ref={articleRef} className="space-y-6">
          {markdownEl}
        </article>
        </div>
      </div>

      {/* Controle de audio (read-along) — isolado, so aparece se ha narracao. */}
      {audioSrc && (
        <NarrationBar audioSrc={audioSrc} segments={narration.segments} articleRef={articleRef} />
      )}
    </div>
  );
};

// React.memo: as props (fileUrl, courseTitle, lessonPrefix) sao strings estaveis.
// Quando o CoursePlatform re-renderiza por causa de setVideoDurations (carregar
// duracao dos videos na lista), a cascade chega ao LessonStepper e daqui aos
// filhos. Sem o memo, o ReactMarkdown re-renderiza; mesmo com o markdownEl
// memoizado, o wrapper ainda re-renderiza e o NarrationBar pode re-montar. Com o
// memo, o React pula o re-render inteiro e os diagramas Mermaid ficam estaveis.
export default memo(MarkdownViewer);

const stripMarkdown = (children) => {
  if (typeof children !== "string") return children;
  return children.replace(/[#*`_[\]()]/g, "").trim();
};
