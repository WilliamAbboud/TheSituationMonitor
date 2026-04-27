/**
 * Situation Monitor — Market Data Proxy
 * Combines Finnhub (stocks/ETFs), CoinGecko (crypto), Frankfurter (forex)
 * Keeps FINNHUB_API_KEY server-side — never exposed to the browser.
 *
 * ETF proxies used for commodities:
 *   BNO  → Brent Crude Oil   |  USO → WTI Crude Oil  |  GLD → Gold
 *   UNG  → Natural Gas       |  UUP → US Dollar Index |  BDRY → Baltic Dry Index
 *   VIXY → VIX Volatility
 */

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

const SYMBOLS = ['LMT', 'RTX', 'SPY', 'TLT', 'GLD', 'BNO', 'USO', 'UNG', 'UUP', 'BDRY', 'VIXY'];

const DISPLAY_MAP = {
  BNO:  'BRENT',
  USO:  'WTI',
  GLD:  'GOLD',
  UUP:  'DXY',
  UNG:  'NG',
  BDRY: 'BDI',
  VIXY: 'VIX',
  LMT:  'LMT',
  RTX:  'RTX',
  SPY:  'SPY',
  TLT:  'TLT',
};

module.exports = async function handler(req, res) {
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

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY environment variable not set.' });
  }

  try {
    // 1. Finnhub — fetch sequentially to avoid burst rate limiting
    const result = {};
    for (const sym of SYMBOLS) {
      try {
        const r = await fetch(`${FINNHUB_BASE}/quote?symbol=${sym}&token=${apiKey}`, {
          headers: { 'User-Agent': 'SituationMonitor/1.0' },
        });
        const d = await r.json();
        const key = DISPLAY_MAP[sym] || sym;
        // Finnhub returns c:0 when no data — treat as null
        result[key] = {
          price:  (d.c && d.c !== 0) ? d.c  : null,
          change: d.d  ?? null,
          pct:    d.dp ?? null,
        };
      } catch (e) {
        console.error(`Finnhub fetch failed for ${sym}:`, e.message);
        const key = DISPLAY_MAP[sym] || sym;
        result[key] = { price: null, change: null, pct: null };
      }
    }

    // 2. CoinGecko — BTC + ETH (free, no key)
    const cryptoData = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      { headers: { 'User-Agent': 'SituationMonitor/1.0' } }
    ).then(r => r.json()).catch(() => ({}));

    const btcPrice  = cryptoData.bitcoin?.usd;
    const btcChange = cryptoData.bitcoin?.usd_24h_change;
    const ethPrice  = cryptoData.ethereum?.usd;
    const ethChange = cryptoData.ethereum?.usd_24h_change;
    result['BTC'] = { price: btcPrice ?? null, change: btcChange != null ? (btcPrice * btcChange / 100) : null, pct: btcChange ?? null };
    result['ETH'] = { price: ethPrice ?? null, change: ethChange != null ? (ethPrice * ethChange / 100) : null, pct: ethChange ?? null };

    // 3. Frankfurter — EUR/USD, GBP/USD (free, no key)
    const forexData = await fetch(
      'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP',
      { headers: { 'User-Agent': 'SituationMonitor/1.0' } }
    ).then(r => r.json()).catch(() => ({ rates: {} }));

    const eurRate = forexData.rates?.EUR;
    const gbpRate = forexData.rates?.GBP;
    result['EUR/USD'] = { price: eurRate ? parseFloat((1 / eurRate).toFixed(4)) : null, change: null, pct: null };
    result['GBP/USD'] = { price: gbpRate ? parseFloat((1 / gbpRate).toFixed(4)) : null, change: null, pct: null };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json(result);

  } catch (err) {
    console.error('Market proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch market data. Please try again.' });
  }
};
