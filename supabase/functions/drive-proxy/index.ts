// Supabase Edge Function: drive-proxy
// Faz proxy de arquivos do Google Drive usando as credenciais OAuth do dono
// (armazenadas em user_settings). Qualquer usuario autenticado no Supabase
// consegue acessar — o servidor central (Edge Function) tem as credenciais.
//
// Uso: GET https://{ref}.supabase.co/functions/v1/drive-proxy/{fileId}
// Headers obrigatorios: Authorization: Bearer {supabase_jwt}
// Headers opcionais:    Range: bytes=START-END (para streaming)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers': 'content-length, content-range, accept-ranges, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Cache do access_token do Google (1h TTL menos margem de seguranca)
let tokenCache: { accessToken: string | null; expiresAt: number } = {
  accessToken: null,
  expiresAt: 0,
};

const refreshGoogleToken = async (
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> => {
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh falhou: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Valida JWT do Supabase — header Authorization OU query ?jwt= (pra tag <video>)
    const url = new URL(req.url);
    const authHeader = req.headers.get('Authorization');
    const jwt = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '')
      : url.searchParams.get('jwt');

    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthorized — missing jwt' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Extrai fileId da URL
    const segments = url.pathname.split('/').filter(Boolean);
    const fileId = segments[segments.length - 1];
    if (!fileId || fileId === 'drive-proxy') {
      return new Response(JSON.stringify({ error: 'fileId obrigatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Busca credenciais do "dono" (qualquer user que tenha credenciais Drive configuradas)
    const { data: ownerRow } = await adminClient
      .from('user_settings')
      .select('settings')
      .not('settings->>google_refresh_token', 'is', null)
      .limit(1)
      .maybeSingle();

    const ownerSettings = ownerRow?.settings as Record<string, string> | undefined;
    if (!ownerSettings?.google_refresh_token) {
      return new Response(
        JSON.stringify({ error: 'Drive nao configurado em nenhum user_settings' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Refresh do access_token Google
    const accessToken = await refreshGoogleToken(
      ownerSettings.google_client_id,
      ownerSettings.google_client_secret,
      ownerSettings.google_refresh_token,
    );

    // 5. Streaming do Drive com Range header
    const range = req.headers.get('range');
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(range ? { Range: range } : {}),
        },
      },
    );

    // 6. Forward dos headers relevantes + body em stream
    const responseHeaders = new Headers(corsHeaders);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = driveRes.headers.get(h);
      if (v) responseHeaders.set(h, v);
    }
    if (!responseHeaders.has('accept-ranges')) {
      responseHeaders.set('accept-ranges', 'bytes');
    }

    return new Response(driveRes.body, {
      status: driveRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('drive-proxy error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
