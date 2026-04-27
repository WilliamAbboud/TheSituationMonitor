/**
 * Situation Monitor — NewsAPI Proxy
 * Vercel serverless function — keeps NEWS_API_KEY server-side, never exposed to browser.
 *
 * Usage: GET /api/news?q=<query>&pageSize=<n>&sortBy=publishedAt|relevancy|popularity
 *        GET /api/news?headlines=1&country=us&category=general   (top headlines)
 */

module.exports = async function handler(req, res) {
  // CORS — allow the monitor to call this from any origin
  const ALLOWED_ORIGINS = [
  'https://thesituationmonitor.vercel.app',  // ← change to your actual deployed URL
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean);
const origin = req.headers.origin;
if (origin && ALLOWED_ORIGINS.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      status: 'error',
      message: 'NEWS_API_KEY environment variable not set. Add it in your Vercel project settings.',
    });
  }

  const {
    q,
    headlines,
    category = 'general',
    country = 'us',
    pageSize = '20',
    sortBy = 'publishedAt',
    language = 'en',
    sources,
    domains,
    from,
  } = req.query;

  // Input validation
  const VALID_CATEGORIES = ['general','business','entertainment','health','science','sports','technology'];
  const VALID_SORT = ['publishedAt','relevancy','popularity'];
  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ status: 'error', message: 'Invalid category' });
  }
  if (sortBy && !VALID_SORT.includes(sortBy)) {
    return res.status(400).json({ status: 'error', message: 'Invalid sortBy' });
  }
  if (q && q.length > 500) {
    return res.status(400).json({ status: 'error', message: 'Query too long' });
  }
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return res.status(400).json({ status: 'error', message: 'Invalid date format' });
  }
  if (country && !/^[a-z]{2}$/i.test(country)) {
    return res.status(400).json({ status: 'error', message: 'Invalid country code' });
  }

  try {
    let url;

    if (headlines === '1' || headlines === 'true') {
      // Top Headlines endpoint
      const params = new URLSearchParams({
        pageSize: String(Math.min(parseInt(pageSize), 100)),
        apiKey,
      });
      if (sources) {
        params.set('sources', sources); // sources + country can't coexist
      } else {
        params.set('country', country);
        params.set('category', category);
      }
      if (q) params.set('q', q);
      url = `https://newsapi.org/v2/top-headlines?${params}`;
    } else {
      // Everything endpoint (broader, date-sorted)
      const query = q || 'geopolitics OR military OR conflict OR sanctions OR war OR diplomacy';
      const params = new URLSearchParams({
        q: query,
        sortBy,
        pageSize: String(Math.min(parseInt(pageSize), 100)),
        language,
        apiKey,
      });
      if (from) params.set('from', from);
      // domains filters to specific outlets — cannot be combined with sources
      if (domains && !sources) params.set('domains', domains);
      url = `https://newsapi.org/v2/everything?${params}`;
    }

    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'SituationMonitor/1.0' },
    });

    const data = await upstream.json();

    if (data.status === 'error') {
      return res.status(400).json(data);
    }

    // Cache hint — news is fresh enough for 3 min
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (err) {
    console.error('NewsAPI proxy error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch news. Please try again.' });
  }
};
