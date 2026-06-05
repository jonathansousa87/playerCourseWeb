import { query } from '../db/index.js';

// Ponte banco -> runtime. O frontend (ConfigModal) salva as credenciais da
// plataforma na tabela user_settings (JSONB). O servidor lê tudo de
// process.env, entao no startup copiamos esses valores do banco para o
// process.env — assim nao e preciso repetir as credenciais no .env de cada
// maquina (Windows, etc.). Um valor do banco so sobrescreve o .env quando
// existir e nao for vazio.
const DB_TO_ENV = {
  google_client_id: 'GOOGLE_CLIENT_ID',
  google_client_secret: 'GOOGLE_CLIENT_SECRET',
  google_refresh_token: 'GOOGLE_REFRESH_TOKEN',
  drive_folder_id: 'DRIVE_COURSES_FOLDER_ID',
  deepseek_api_key: 'DEEPSEEK_API_KEY',
};

export const loadCredsFromDB = async () => {
  try {
    // user_settings pode ter varias linhas (uma por usuario). Em uso local
    // single-user, pega a mais recentemente atualizada.
    const { rows } = await query(
      'SELECT settings FROM user_settings ORDER BY updated_at DESC LIMIT 1',
    );
    if (!rows.length) return 0;

    const s = rows[0].settings || {};
    let count = 0;
    for (const [dbKey, envKey] of Object.entries(DB_TO_ENV)) {
      const val = typeof s[dbKey] === 'string' ? s[dbKey].trim() : s[dbKey];
      if (val) {
        process.env[envKey] = val;
        count += 1;
      }
    }

    // Habilita modo Drive automaticamente quando ha uma pasta configurada e o
    // .env nao definiu COURSE_SOURCE explicitamente.
    if (!process.env.COURSE_SOURCE && (s.drive_folder_id || '').trim()) {
      process.env.COURSE_SOURCE = 'drive';
    }

    if (count) {
      console.log(`[Creds] ${count} credencial(is) carregada(s) do banco (user_settings).`);
    }
    return count;
  } catch (e) {
    console.warn('[Creds] Nao foi possivel carregar credenciais do banco:', e.message);
    return 0;
  }
};
