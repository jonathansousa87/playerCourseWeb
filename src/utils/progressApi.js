const API_BASE = "";

const enc = encodeURIComponent;

const json = (res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// === Snapshot geral (usado no carregamento inicial) ===
export const fetchAllProgress = () =>
  fetch(`${API_BASE}/api/progress/all`).then(json);

// === Lessons ===
export const markLessonComplete = (courseTitle, lessonPath) =>
  fetch(`${API_BASE}/api/progress/${enc(courseTitle)}/lessons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonPath }),
  }).then(json);

export const unmarkLessonComplete = (courseTitle, lessonPath) =>
  fetch(`${API_BASE}/api/progress/${enc(courseTitle)}/lessons`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonPath }),
  }).then(json);

// === Steps ===
// stepKey interno no frontend: `${lessonPrefix}__${type}`
// Dividimos ao mandar para o backend.
const splitStepKey = (fullKey) => {
  const idx = fullKey.indexOf("__");
  if (idx < 0) return { lessonPrefix: "", stepKey: fullKey };
  return {
    lessonPrefix: fullKey.slice(0, idx),
    stepKey: fullKey.slice(idx + 2),
  };
};

export const markStepComplete = (courseTitle, fullKey) => {
  const { lessonPrefix, stepKey } = splitStepKey(fullKey);
  return fetch(`${API_BASE}/api/progress/${enc(courseTitle)}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonPrefix, stepKey }),
  }).then(json);
};

export const unmarkStepComplete = (courseTitle, fullKey) => {
  const { lessonPrefix, stepKey } = splitStepKey(fullKey);
  return fetch(`${API_BASE}/api/progress/${enc(courseTitle)}/steps`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonPrefix, stepKey }),
  }).then(json);
};

// === Resumo pessoal ===
// Retorna { content, prompts, updated_at }. prompts pode ser null (legacy)
// ou objeto com chaves { answered, connections, example, unclear } (Fase 7.3).
export const fetchPersonalNote = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/db/notes/${enc(courseTitle)}/pessoal/${enc(lessonPrefix)}`,
  ).then(json);

// content: campo livre. prompts: objeto com respostas estruturadas (opcional).
// Se prompts === undefined, o backend preserva o que estava no DB.
export const savePersonalNote = (courseTitle, lessonPrefix, { content, prompts } = {}) => {
  const body = { lessonPrefix, content: content ?? "" };
  if (prompts !== undefined) body.prompts = prompts;
  return fetch(`${API_BASE}/api/db/notes/${enc(courseTitle)}/pessoal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(json);
};

// === Pomodoro ===
export const fetchPomodoroSessions = (courseTitle) =>
  fetch(`${API_BASE}/api/db/notes/${enc(courseTitle)}/pomodoro`).then(json);

export const savePomodoroSession = (courseTitle, content, lessonPrefix = null, kind = "reflection") =>
  fetch(`${API_BASE}/api/db/notes/${enc(courseTitle)}/pomodoro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, lessonPrefix, kind }),
  }).then(json);

export const fetchRecentStats = () =>
  fetch(`${API_BASE}/api/stats/recent`).then(json);

// === Diario semanal ===
export const fetchWeeklyDiaries = (courseTitle) =>
  fetch(`${API_BASE}/api/db/diary/${enc(courseTitle)}`).then(json);

export const saveWeeklyDiary = (courseTitle, weekKey, fields) =>
  fetch(`${API_BASE}/api/db/diary/${enc(courseTitle)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      weekKey,
      learned: fields.learned ?? "",
      decisions: fields.decisions ?? "",
      different: fields.different ?? "",
    }),
  }).then(json);

// === Flashcards / FSRS ===
export const importFlashcardDeck = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/flashcards/${enc(courseTitle)}/${enc(lessonPrefix)}/import`,
    { method: "POST" },
  ).then(json);

export const fetchFlashcardDeck = (courseTitle, lessonPrefix) =>
  fetch(`${API_BASE}/api/flashcards/${enc(courseTitle)}/${enc(lessonPrefix)}`)
    .then((res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });

export const fetchDueFlashcards = ({ courseTitle, limit = 50 } = {}) => {
  const params = new URLSearchParams();
  if (courseTitle) params.set("courseTitle", courseTitle);
  if (limit) params.set("limit", String(limit));
  return fetch(`${API_BASE}/api/flashcards/due?${params.toString()}`).then(json);
};

export const fetchFlashcardSummary = () =>
  fetch(`${API_BASE}/api/flashcards/summary`).then(json);

// rating: 1=Again, 2=Hard, 3=Good, 4=Easy
// confidence (opcional): 'high' | 'medium' | 'low' — captura pre-flip
// pra detectar hypercorrection (Metcalfe 2017)
export const reviewFlashcard = (cardId, rating, confidence = null) =>
  fetch(`${API_BASE}/api/flashcards/review/${cardId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, confidence }),
  }).then(json);

// Cards com confianca='high' que foram errados — Metcalfe 2017
export const fetchHypercorrection = ({ days = 30, limit = 10 } = {}) =>
  fetch(
    `${API_BASE}/api/flashcards/hypercorrection?days=${days}&limit=${limit}`,
  ).then(json);

// === Dashboard ===
export const fetchDashboardStats = () =>
  fetch(`${API_BASE}/api/stats/dashboard`).then(json);

export const fetchProfileStats = () =>
  fetch(`${API_BASE}/api/stats/profile`).then(json);

// Razao recall (ativo) / leitura (passivo) - Bjork & Bjork 2011
export const fetchActivityBalance = (days = 30) =>
  fetch(`${API_BASE}/api/stats/activity-balance?days=${days}`).then(json);

// Badges de retencao de longo prazo - Bahrick & Hall
export const fetchRetentionBadges = () =>
  fetch(`${API_BASE}/api/stats/retention-badges`).then(json);

// Salva uma sessao de consumo passivo (video/resumo/exemplos). Usa
// keepalive: a request continua mesmo quando a aba esta saindo (chamado
// no unmount / unload).
export const saveViewSession = ({ courseTitle, lessonPrefix, kind, seconds }) => {
  const body = JSON.stringify({ courseTitle, lessonPrefix, kind, seconds });
  // navigator.sendBeacon eh ideal pra unmount mas nao retorna resposta;
  // fallback pra fetch com keepalive.
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(`${API_BASE}/api/stats/view-session`, blob);
    return Promise.resolve({ saved: true, beacon: true });
  }
  return fetch(`${API_BASE}/api/stats/view-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).then(json);
};

// === Diario tecnico ===
export const fetchTechnicalDiary = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/db/diary-tecnico/${enc(courseTitle)}/${enc(lessonPrefix)}`,
  ).then(json);

export const saveTechnicalDiary = (courseTitle, lessonPrefix, content) =>
  fetch(
    `${API_BASE}/api/db/diary-tecnico/${enc(courseTitle)}/${enc(lessonPrefix)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    },
  ).then(json);

// === Quiz ===
export const fetchQuizAttempts = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/quiz/${enc(courseTitle)}/${enc(lessonPrefix)}/attempts`,
  ).then(json);

export const saveQuizAttempt = (courseTitle, lessonPrefix, { score, total }) =>
  fetch(
    `${API_BASE}/api/quiz/${enc(courseTitle)}/${enc(lessonPrefix)}/attempts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, total }),
    },
  ).then(json);

// Converte questoes erradas do quiz em flashcards extras no deck da aula
export const saveWrongAsFlashcards = (courseTitle, lessonPrefix, items) =>
  fetch(
    `${API_BASE}/api/quiz/${enc(courseTitle)}/${enc(lessonPrefix)}/wrong-to-flashcards`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
  ).then(json);

// Acerto por aula nos ultimos N dias (default 30) - agrega flashcard_review_log
export const fetchLessonAccuracy = (courseTitle, days = 30) =>
  fetch(
    `${API_BASE}/api/stats/lesson-accuracy/${enc(courseTitle)}?days=${days}`,
  ).then(json);

// Chat com IA usando a transcricao da aula como contexto.
// O backend carrega o historico do DB sozinho — frontend so manda a msg nova.
export const sendChatMessage = ({ courseTitle, lessonPrefix, message, model }) =>
  fetch(`${API_BASE}/api/ia/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseTitle, lessonPrefix, message, model }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  });

export const fetchChatHistory = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/ia/chat/${enc(courseTitle)}/${enc(lessonPrefix)}`,
  ).then(json);

export const clearChatHistory = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/ia/chat/${enc(courseTitle)}/${enc(lessonPrefix)}`,
    { method: "DELETE" },
  ).then(json);

// Grupos de cards com fronts semanticamente similares (confusao)
export const fetchConfusionGroups = ({ courseTitle, minLapses = 2, threshold = 0.4 } = {}) => {
  const params = new URLSearchParams();
  if (courseTitle) params.set("courseTitle", courseTitle);
  params.set("minLapses", String(minLapses));
  params.set("threshold", String(threshold));
  return fetch(`${API_BASE}/api/flashcards/confusion?${params.toString()}`).then(json);
};

// === Migracao one-shot ===
export const migrateLocalStorage = (payload) =>
  fetch(`${API_BASE}/api/migrate-localstorage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(json);

// Apaga todo o material gerado (IA) do curso no banco — resumo/quiz/exemplos/
// diario/piada, decks de flashcards e pre-questoes. Nao toca em progresso nem
// nos arquivos do curso no Drive.
export const clearCourseMaterials = (courseTitle) =>
  fetch(`${API_BASE}/api/materials/${enc(courseTitle)}`, {
    method: "DELETE",
  }).then(json);

// === IA (DeepSeek) ===
// kinds: array de 'resumo' | 'quiz' | 'flashcards' | 'diario'
export const generateIa = ({ courseTitle, lessonPrefix, kinds, model }) =>
  fetch(`${API_BASE}/api/ia/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseTitle, lessonPrefix, kinds, model }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  });

// === Pre-questoes (Carpenter & Toftness 2017) ===
// Retorna { questions, lastAttempt, generatedAt } ou { questions: null }
// se ainda nao foi gerado pra essa aula.
export const fetchPrequestions = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/ia/prequestions/${enc(courseTitle)}/${enc(lessonPrefix)}`,
  ).then(json);

export const generatePrequestions = ({ courseTitle, lessonPrefix, model }) =>
  fetch(`${API_BASE}/api/ia/prequestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseTitle, lessonPrefix, model }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  });

export const savePrequestionAttempt = (courseTitle, lessonPrefix, answers) =>
  fetch(
    `${API_BASE}/api/ia/prequestions/${enc(courseTitle)}/${enc(lessonPrefix)}/attempts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    },
  ).then(json);

export const deletePrequestions = (courseTitle, lessonPrefix) =>
  fetch(
    `${API_BASE}/api/ia/prequestions/${enc(courseTitle)}/${enc(lessonPrefix)}`,
    { method: "DELETE" },
  ).then(json);
