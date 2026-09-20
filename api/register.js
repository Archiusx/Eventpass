// Vercel serverless function: POST /api/register
// Calls the secured `register_attendee` RPC — no direct table access.
// Supabase URL / key live in api/_supabase.js.

const { rpc } = require('./_supabase');
const { sendTicketEmail } = require('./_mailer');

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

  // Email the PDF ticket — only if the DB-side limits allow it (see supabase_email_limit.sql).
  // Never blocks/fails the registration (8s cap).
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  const slot = await rpc('claim_email_slot', { p_ticket_id: row.ticket_id, p_email: email, p_ip: ip });
  if (!slot.ok) console.error('claim_email_slot failed — did you run api/supabase_email_limit.sql?');
  const emailed = slot.ok && slot.data === true && await Promise.race([
    sendTicketEmail({
      ticketId: row.ticket_id, name: fullName, email, phone, college, course,
      event: row.event_name || 'LAN ARENA 2026',
      venue: row.venue || 'Bajaj Institute of Technology, Wardha',
      date: row.event_date || 'Date & time to be announced',
    }),
    new Promise((r) => setTimeout(() => r(false), 8000)),
  ]);

  return res.status(200).json({
    emailed,
    ticket_id: row.ticket_id,
    event_name: row.event_name,
    venue: row.venue,
    event_date: row.event_date,
  });
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
