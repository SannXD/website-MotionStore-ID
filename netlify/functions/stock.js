exports.handler = async function (event) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: 'Bearer ' + SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // Ambil stok saat ini
    if (event.httpMethod === 'GET') {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/stock?id=eq.1&select=remaining',
        { headers }
      );
      const data = await res.json();
      const remaining = data[0] ? data[0].remaining : 0;
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ remaining }),
      };
    }

    // Kurangi stok -1 (dipanggil pas pembeli klik "Sudah Bayar")
    if (event.httpMethod === 'POST') {
      const getRes = await fetch(
        SUPABASE_URL + '/rest/v1/stock?id=eq.1&select=remaining',
        { headers }
      );
      const getData = await getRes.json();
      let remaining = getData[0] ? getData[0].remaining : 0;

      if (remaining > 0) {
        remaining -= 1;
        await fetch(SUPABASE_URL + '/rest/v1/stock?id=eq.1', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ remaining }),
        });
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ remaining }),
      };
    }

    return { statusCode: 405, headers: corsHeaders, body: 'Method not allowed' };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
