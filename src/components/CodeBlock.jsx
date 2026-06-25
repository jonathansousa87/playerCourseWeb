import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

// Bloco de codigo com "janela" (pontinhos) + syntax highlighting estilo IDE
// (tema One Dark). Reusado pelo MarkdownViewer e pelo ExamplesViewer. A linguagem
// vem da classe 'language-xxx' que o react-markdown poe; sem linguagem, o Prism
// renderiza como texto puro (sem erro).
const CodeBlock = ({ className, children }) => {
  const lang = (/\blanguage-([\w-]+)/.exec(className || "") || [])[1] || "text";
  const code = String(children).replace(/\n$/, "");
  return (
    <div className="my-5 bg-slate-900/80 border border-slate-700/40 rounded-xl overflow-hidden">
      <div className="flex items-center px-4 py-2 bg-slate-800/40 border-b border-slate-700/30">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/40" />
        </div>
        {lang !== "text" && (
          <span className="ml-3 text-[11px] uppercase tracking-wide text-slate-500 font-mono">{lang}</span>
        )}
      </div>
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        // fundo transparente -> usa o slate-900/80 da moldura (em vez do cinza
        // padrao do One Dark), so as CORES dos tokens vem do tema.
        customStyle={{ margin: 0, background: "transparent", padding: "1rem", fontSize: "13px", overflowX: "auto" }}
        codeTagProps={{ style: { fontFamily: FONT } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;
