import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Sparkles, Trash2 } from "lucide-react";
import {
  sendChatMessage,
  fetchChatHistory,
  clearChatHistory,
} from "../utils/progressApi";

const SUGGESTED_QUESTIONS = [
  "Resume essa aula em 3 frases",
  "Qual o conceito principal?",
  "Me dê um exemplo prático",
  "O que devo memorizar?",
];

const LessonChat = ({ courseTitle, lessonPrefix, lessonTitle }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Carrega historico do DB ao montar (e quando a aula trocar)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchChatHistory(courseTitle, lessonPrefix)
      .then((rows) => {
        if (cancelled) return;
        setMessages(
          (rows || []).map((r) => ({ role: r.role, content: r.content })),
        );
      })
      .catch(() => {
        // Se nao tem historico ainda, segue vazio
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseTitle, lessonPrefix]);

  // Auto-scroll pro fim a cada mensagem nova
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const send = useCallback(
    async (text) => {
      const content = text.trim();
      if (!content || sending) return;

      setError("");
      // Otimista: mostra a pergunta na hora
      const optimistic = [...messages, { role: "user", content }];
      setMessages(optimistic);
      setInput("");
      setSending(true);

      try {
        const res = await sendChatMessage({
          courseTitle,
          lessonPrefix,
          message: content,
        });
        setMessages([...optimistic, { role: "assistant", content: res.reply }]);
      } catch (err) {
        setError(err.message || "Falha ao chamar a IA");
        // Reverte a otimista (volta input pra o user editar)
        setMessages(messages);
        setInput(content);
      } finally {
        setSending(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [courseTitle, lessonPrefix, messages, sending],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleClear = async () => {
    if (messages.length === 0) return;
    if (!window.confirm("Limpar todo o histórico desse chat?")) return;
    try {
      await clearChatHistory(courseTitle, lessonPrefix);
      setMessages([]);
      setError("");
    } catch (err) {
      setError(err.message || "Falha ao limpar histórico");
    }
  };

  const empty = !loading && messages.length === 0;

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
        <div className="w-full">
          {loading && (
            <div className="text-center py-12 text-slate-500 text-sm">
              Carregando histórico...
            </div>
          )}

          {empty && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 mb-4">
                <Sparkles className="w-6 h-6 text-blue-300" />
              </div>
              <h3 className="text-slate-100 font-semibold text-lg mb-2">
                Tire dúvidas sobre essa aula
              </h3>
              <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
                A IA usa a transcrição de{" "}
                <strong className="text-slate-200">{lessonTitle}</strong> como
                contexto. Pergunta o que quiser entender melhor.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={sending}
                    className="px-3 py-1.5 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <ChatMessage key={idx} message={m} />
          ))}

          {sending && (
            <div className="flex items-center gap-2 px-4 py-3 mb-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-blue-400/60 rounded-full animate-pulse" />
                <span
                  className="w-2 h-2 bg-blue-400/60 rounded-full animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                />
                <span
                  className="w-2 h-2 bg-blue-400/60 rounded-full animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
              <span className="text-xs text-slate-500">pensando...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-950/30 border border-red-500/30 text-red-200 text-sm rounded-xl px-4 py-3 mb-3">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-800/60 bg-slate-900/40 px-4 lg:px-8 py-4">
        <form onSubmit={handleSubmit} className="w-full flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunta algo sobre a aula... (Enter pra enviar, Shift+Enter pra quebrar linha)"
            rows={1}
            disabled={sending || loading}
            className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none text-sm leading-relaxed disabled:opacity-50"
            style={{ minHeight: "48px", maxHeight: "200px" }}
          />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="Limpar chat"
              className="p-3 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl text-slate-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || sending || loading}
            className="p-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Enviar (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

const ChatMessage = ({ message }) => {
  const isUser = message.role === "user";
  return (
    <div className={`mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-blue-600/15 border border-blue-500/30 text-blue-50"
            : "bg-slate-900/60 border border-slate-800 text-slate-200"
        }`}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="text-sm leading-relaxed prose-embedded">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default LessonChat;
