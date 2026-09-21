// Vercel serverless function: GET /api/leaderboard
// Public, read-only standings for every game. Cached at the edge so a crowd
// refreshing the page barely touches the database.

const { rpc } = require('./_supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const out = await rpc('public_leaderboard', {});
  if (!out.ok || !out.data || typeof out.data !== 'object') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Leaderboard unavailable.' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
  return res.status(200).json({ games: out.data });
};
