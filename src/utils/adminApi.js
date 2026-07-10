const API_BASE = "";

const jsonOrThrow = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

// === Gestao de usuarios (so admin — ver requireAdmin em server/auth.js) ===
export const fetchAdminUsers = () =>
  fetch(`${API_BASE}/api/admin/users`).then(jsonOrThrow);

export const updateAdminUser = (userId, patch) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(jsonOrThrow);

// === Permissao de curso por usuario ===
export const fetchUserCourses = (userId) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/courses`).then(jsonOrThrow);

export const saveUserCourses = (userId, courseTitles) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/courses`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseTitles }),
  }).then(jsonOrThrow);

// === Progresso de outro usuario (so leitura) ===
export const fetchAdminDashboard = (userId) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/dashboard`).then(jsonOrThrow);

export const fetchAdminProfile = (userId) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/profile`).then(jsonOrThrow);

export const fetchAdminActivityBalance = (userId, days = 30) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/activity-balance?days=${days}`).then(jsonOrThrow);

export const fetchAdminRetentionBadges = (userId) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/retention-badges`).then(jsonOrThrow);

export const fetchAdminFlashcardsSummary = (userId) =>
  fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(userId)}/flashcards-summary`).then(jsonOrThrow);
