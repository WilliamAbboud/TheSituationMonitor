export default async function handler(req, res) {
  const ALLOWED_ORIGINS = [
  'https://thesituationmonitor.vercel.app',  // ← change to your actual deployed URL
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean);
const origin = req.headers.origin;
if (origin && ALLOWED_ORIGINS.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  const FEEDS = [
    { name: 'BBC World',   url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'Reuters',     url: 'https://feeds.reuters.com/reuters/worldNews' },
    { name: 'Al Jazeera',  url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'France 24',   url: 'https://www.france24.com/en/rss' },
    { name: 'DW News',     url: 'https://rss.dw.com/rdf/rss-en-all' },
    { name: 'Haaretz',     url: 'https://www.haaretz.com/cmlink/1.628765' },
    { name: 'Arab News',   url: 'https://www.arabnews.com/rss.xml' },
  ];

  function parseRSS(xml, sourceName) {
    const items = [];
    const rx = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = rx.exec(xml)) !== null) {
      const block = m[1];
      const title = (
        block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
        block.match(/<title>([^<]*)<\/title>/)
      )?.[1]?.trim()
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      const pubDate = block.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1]?.trim();
      const link = (
        block.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/) ||
        block.match(/<link>([^<]*)<\/link>/) ||
        block.match(/<link\s+href="([^"]+)"/)
      )?.[1]?.trim();
      if (title && title.length > 10) {
        items.push({
          title,
          pubDate: pubDate || new Date().toUTCString(),
          link: link || '',
          source: sourceName,
        });
      }
    }
    return items.slice(0, 8);
  }

  try {
    const results = await Promise.allSettled(
      FEEDS.map(feed => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        return fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SituationMonitor/1.0)' },
          signal: controller.signal,
        })
          .finally(() => clearTimeout(timer))
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          })
          .then(xml => parseRSS(xml, feed.name))
          .catch(() => []);
      })
    );

    const items = results
      .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 40);

    res.json({ status: 'ok', count: items.length, items });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}
