// worker.js — entry point untuk Cloudflare Workers (gabungan situs statis + API stok)

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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
    return new Response(JSON.stringify({ remaining }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
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
    return new Response(JSON.stringify({ remaining }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/stock') {
      if (request.method === 'OPTIONS') {
        return new Response('', { status: 200, headers: corsHeaders });
      }
      if (request.method === 'GET') return handleStockGet(env);
      if (request.method === 'POST') return handleStockPost(env);
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    // Selain /stock, serve file statis (index.html, dll) dari folder assets
    return env.ASSETS.fetch(request);
  },
};
    
