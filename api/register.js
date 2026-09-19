// Vercel serverless function: POST /api/register
// Env vars (exact names): db_link (Supabase project URL), supabase_pb_key (publishable/anon key)
// Calls the secured `register_attendee` RPC — no direct table access.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const baseUrl = (process.env.db_link || "").trim().replace(/\/+$/, "");
  const key = (process.env.supabase_pb_key || "").trim();
  if (!baseUrl || !key) {
    console.error("Missing env vars: db_link / supabase_pb_key");
    return res.status(500).json({ error: "Server is not configured." });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const clean = (v) => (typeof v === "string" ? v.trim() : "");
  const fullName = clean(body.fullName);
  const email = clean(body.email).toLowerCase();
  const phone = clean(body.phone);
  const college = clean(body.college);
  const course = clean(body.course);

  if (!fullName || !email || !phone || !college || !course) {
    return res.status(400).json({ error: "All fields are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!/^[0-9+\-\s]{7,15}$/.test(phone)) {
    return res.status(400).json({ error: "Please enter a valid phone number." });
  }
  if ([fullName, college, course].some((v) => v.length > 200) || email.length > 200) {
    return res.status(400).json({ error: "Input too long." });
  }

  try {
    const r = await fetch(`${baseUrl}/rest/v1/rpc/register_attendee`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        p_full_name: fullName,
        p_email: email,
        p_phone: phone,
        p_college: college,
        p_course: course,
      }),
    });

    const out = await r.json().catch(() => null);
    if (!r.ok) {
      console.error("Supabase RPC error:", r.status, out);
      return res.status(502).json({ error: "Registration failed. Please try again." });
    }

    const row = Array.isArray(out) ? out[0] : out;
    if (!row || !row.ticket_id) {
      console.error("Unexpected RPC response:", out);
      return res.status(502).json({ error: "Registration failed. Please try again." });
    }

    return res.status(200).json({
      ticket_id: row.ticket_id,
      event_name: row.event_name,
      venue: row.venue,
      event_date: row.event_date,
    });
  } catch (err) {
    console.error("register handler error:", err);
    return res.status(500).json({ error: "Registration failed. Please try again." });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
