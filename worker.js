// worker.js — entry point untuk Cloudflare Workers (situs statis + API stok + admin login)
//
// ENV VARS / SECRETS yang harus diisi di Cloudflare (Settings > Variables):
//   SUPABASE_URL          - sudah ada
//   SUPABASE_SECRET_KEY   - sudah ada
//   ADMIN_PASSWORD        - BARU. Password buat login admin panel (?manage)
//   ADMIN_TOKEN_SECRET    - BARU. String rahasia acak (bebas, panjang) buat tanda tangan sesi login

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// ---- STOCK (tidak diubah dari versi asli) ----
async function getRemaining(env) {
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const res = await fetch(
    env.SUPABASE_URL + '/rest/v1/stock?id=eq.1&select=remaining',
    { headers }
  );
  const data = await res.json();
  return { remaining: data[0] ? data[0].remaining : 0, headers };
}

async function handleStockGet(env) {
  try {
    const { remaining } = await getRemaining(env);
    return json({ remaining });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleStockPost(env) {
  try {
    const { remaining: current, headers } = await getRemaining(env);
    let remaining = current;
    if (remaining > 0) {
      remaining -= 1;
      await fetch(env.SUPABASE_URL + '/rest/v1/stock?id=eq.1', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ remaining }),
      });
    }
    return json({ remaining });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ════════════════════════════════════════════════
//  ADMIN LOGIN — BARU
//  Worker tidak menyimpan sesi di mana pun (stateless).
//  Token = payload(berisi waktu kedaluwarsa) + tanda tangan HMAC.
//  Setiap kali /admin/save dipanggil, tanda tangan dicek ulang.
// ════════════════════════════════════════════════
async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function createSessionToken(env) {
  const payload = JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 6 }); // berlaku 6 jam
  const payloadB64 = btoa(payload);
  const sig = await hmacSign(payloadB64, env.ADMIN_TOKEN_SECRET);
  return payloadB64 + '.' + sig;
}

async function verifySessionToken(token, env) {
  if (!token || !token.includes('.')) return false;
  const [payloadB64, sig] = token.split('.');
  const expectedSig = await hmacSign(payloadB64, env.ADMIN_TOKEN_SECRET);
  if (sig !== expectedSig) return false;
  try {
    const payload = JSON.parse(atob(payloadB64));
    return typeof payload.exp === 'number' && Date.now() < payload.exp;
  } catch {
    return false;
  }
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handleAdminLogin(request, env) {
  const passInput = request.headers.get('X-Admin-Password') || '';
  if (!env.ADMIN_PASSWORD) return json({ ok: false, error: 'ADMIN_PASSWORD belum diset di Worker' }, 500);
  if (!safeEqual(passInput, env.ADMIN_PASSWORD)) {
    return json({ ok: false, error: 'Password salah!' }, 401);
  }
  const token = await createSessionToken(env);
  return json({ ok: true, token });
}

// admin/save sementara cuma verifikasi token, belum simpan data toko
// (fitur simpan data toko/pengumuman/produk bisa ditambah belakangan)
async function handleAdminSave(request, env) {
  const token = request.headers.get('X-Admin-Password') || '';
  const valid = await verifySessionToken(token, env);
  if (!valid) return json({ ok: false, error: 'Sesi habis atau tidak sah, login ulang' }, 401);
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response('', { status: 200, headers: corsHeaders });
    }

    if (path === '/stock') {
      if (method === 'GET') return handleStockGet(env);
      if (method === 'POST') return handleStockPost(env);
      return json({ error: 'Method not allowed' }, 405);
    }

    if (path === '/admin/login' && method === 'POST') {
      return handleAdminLogin(request, env);
    }

    if (path === '/admin/save' && method === 'POST') {
      return handleAdminSave(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
