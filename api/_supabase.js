// Shared Supabase helper for the serverless functions (file name starts with "_",
// so Vercel does NOT expose it as an endpoint).
//
// >>> Paste your Supabase Project URL below — this is the ONLY place. <<<
// The publishable key is meant to be public (tables are locked by RLS, and only
// the RPC functions are exposed to anon). NEVER put a secret / service_role key here.
const DEFAULT_SUPABASE_URL = 'PASTE_SUPABASE_PROJECT_URL_HERE'; // e.g. https://abcdxyz.supabase.co
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_y2XbvE4mG8HepUqTpWpybg_FKJIsHMM';

function getConfig() {
  const url = (process.env.SUPABASE_URL || process.env.db_link || DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || process.env.supabase_pb_key || DEFAULT_PUBLISHABLE_KEY).trim();
  return { url, key };
}

// Calls a Postgres function through Supabase REST. Never throws.
// Returns { ok, status, data }.
async function rpc(name, args) {
  const { url, key } = getConfig();
  if (!key || url.includes('PASTE_SUPABASE') || !/^https?:\/\//i.test(url)) {
    console.error('Supabase URL is not set in api/_supabase.js');
    return { ok: false, status: 500, data: null, notConfigured: true };
  }
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(args || {}),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) console.error(`Supabase RPC ${name} failed:`, r.status, data);
    return { ok: r.ok, status: r.status, data };
  } catch (err) {
    console.error(`Supabase RPC ${name} error:`, err);
    return { ok: false, status: 502, data: null };
  }
}

module.exports = { rpc, getConfig };
