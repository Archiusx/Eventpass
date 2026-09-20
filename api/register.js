// Vercel serverless function: POST /api/register
// Calls the secured `register_attendee` RPC — no direct table access.
// Supabase URL / key live in api/_supabase.js.

const { rpc } = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  const fullName = clean(body.fullName);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  const college = clean(body.college);
  const course = clean(body.course);

  if (!fullName || !email || !phone || !college || !course) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!/^[0-9+\-\s]{7,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }
  if ([fullName, college, course].some((v) => v.length > 200) || email.length > 200) {
    return res.status(400).json({ error: 'Input too long.' });
  }

  const out = await rpc('register_attendee', {
    p_full_name: fullName,
    p_email: email,
    p_phone: phone,
    p_college: college,
    p_course: course,
  });

  if (out.notConfigured) {
    return res.status(500).json({ error: 'Server is not configured: set the Supabase URL in api/_supabase.js.' });
  }
  const row = Array.isArray(out.data) ? out.data[0] : out.data;
  if (!out.ok || !row || !row.ticket_id) {
    return res.status(502).json({ error: 'Registration failed. Please try again.' });
  }

  return res.status(200).json({
    ticket_id: row.ticket_id,
    event_name: row.event_name,
    venue: row.venue,
    event_date: row.event_date,
  });
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
