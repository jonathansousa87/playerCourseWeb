import express from 'express';
import { google } from 'googleapis';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { clearCache, isConfigured } from '../drive/index.js';

// Persiste GOOGLE_REFRESH_TOKEN no .env e atualiza process.env em runtime.
// Assim o reconect via UI não exige reiniciar o servidor manualmente.
const ENV_PATH = resolve(process.cwd(), '.env');
const persistRefreshToken = (token) => {
  process.env.GOOGLE_REFRESH_TOKEN = token;
  try {
    let content = readFileSync(ENV_PATH, 'utf8');
    if (/^GOOGLE_REFRESH_TOKEN=.*/m.test(content)) {
      content = content.replace(/^GOOGLE_REFRESH_TOKEN=.*/m, `GOOGLE_REFRESH_TOKEN=${token}`);
    } else {
      content += `\nGOOGLE_REFRESH_TOKEN=${token}`;
    }
    writeFileSync(ENV_PATH, content, 'utf8');
    console.log('[Drive] Refresh token atualizado no .env e em runtime.');
  } catch (e) {
    console.warn('[Drive] Nao foi possivel gravar .env — token ativo apenas em runtime:', e.message);
  }
};

const router = express.Router();

const createOAuth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/drive/callback',
  );

// GET /api/drive/auth — redireciona para consentimento Google
router.get('/api/drive/auth', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env primeiro.');
  }
  const url = createOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
    prompt: 'consent', // garante refresh_token mesmo se ja autorizou antes
  });
  res.redirect(url);
});

// GET /api/drive/callback — recebe o code e troca por tokens
router.get('/api/drive/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`Erro OAuth Google: ${error}`);
  if (!code) return res.status(400).send('Parametro "code" ausente.');
  try {
    const { tokens } = await createOAuth2Client().getToken(String(code));
    clearCache();
    const rt = tokens.refresh_token;
    if (rt) {
      persistRefreshToken(rt);
    }
    clearCache();
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:500px;width:100%}
h2{color:#4ade80;margin-top:0}p{color:#94a3b8}a{color:#60a5fa;font-weight:600}</style></head><body><div class="card">
<h2>Drive conectado!</h2>
${rt
  ? '<p>Token salvo automaticamente. O servidor já está usando a nova autorizacao — sem necessidade de reiniciar.</p>'
  : '<p>Autorizacao renovada. O servidor já está conectado ao Drive.</p>'
}
<p><a href="/">Voltar para o app</a></p>
</div></body></html>`);
  } catch (err) {
    res.status(500).send('Erro ao trocar code por token: ' + err.message);
  }
});

// GET /api/drive/status
router.get('/api/drive/status', (_req, res) => {
  res.json({
    configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    connected: isConfigured(),
    source: process.env.COURSE_SOURCE || 'filesystem',
    folderId: process.env.DRIVE_COURSES_FOLDER_ID || null,
  });
});

// POST /api/drive/cache/clear — invalida cache de listagem (util em dev)
router.post('/api/drive/cache/clear', (_req, res) => {
  clearCache();
  res.json({ ok: true });
});

export default router;
