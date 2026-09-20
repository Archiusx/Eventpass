// Vercel serverless function: POST /api/admin
// Organizer-only actions. Every call carries the admin password, which is checked
// INSIDE the database (bcrypt hash in a locked table) — it is never stored in
// GitHub or Vercel.
//
// body: { password, action: 'stats' | 'lookup' | 'checkin' | 'undo', ticket_id? }

const { rpc } = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const password = typeof body.password === 'string' ? body.password : '';
  const action = typeof body.action === 'string' ? body.action : '';

  if (!password || password.length > 200) {
    return res.status(401).json({ error: 'Admin password required.' });
  }

  let out;
  if (action === 'stats') {
    out = await rpc('admin_stats', { p_password: password });
  } else if (['lookup', 'checkin', 'undo'].includes(action)) {
    const id = typeof body.ticket_id === 'string' ? body.ticket_id.trim().toUpperCase() : '';
    if (!/^[A-Z0-9-]{4,40}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid ticket ID.' });
    }
    out = await rpc('admin_ticket', { p_password: password, p_ticket_id: id, p_action: action });
  } else {
    return res.status(400).json({ error: 'Unknown action.' });
  }

  if (out.notConfigured) {
    return res.status(500).json({ error: 'Server is not configured: set the Supabase URL in api/_supabase.js.' });
  }
  if (!out.ok || !out.data) {
    // Tell the organizer WHY, so setup problems are obvious.
    if (out.status === 404) {
      return res.status(502).json({ error: 'Admin setup is missing in Supabase. Run supabase_admin_upgrade.sql in the Supabase SQL Editor.' });
    }
    if (out.status === 401 || out.status === 403) {
      return res.status(502).json({ error: 'Supabase rejected the key. Check the publishable key in api/_supabase.js.' });
    }
    if (!out.data) {
      return res.status(502).json({ error: 'Cannot reach Supabase. Check the Project URL in api/_supabase.js and that the project is not paused.' });
    }
    return res.status(502).json({ error: 'Database error: ' + String(out.data.message || out.data.hint || out.status).slice(0, 160) });
  }
  if (out.data.ok === false && out.data.error === 'unauthorized') {
    return res.status(401).json({ error: 'Wrong admin password.' });
  }
  return res.status(200).json(out.data);
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
