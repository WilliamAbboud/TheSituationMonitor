/**
 * Situation Monitor — Vessel Tracking Proxy
 * Uses aisstream.io WebSocket API (free tier)
 * Queries live AIS data at strategic maritime chokepoints
 */

const CHOKEPOINTS = [
  { name: 'Suez Canal',          bbox: [31.0, 29.5, 33.0, 31.5] },
  { name: 'Strait of Hormuz',    bbox: [55.0, 25.5, 57.5, 27.0] },
  { name: 'Strait of Malacca',   bbox: [99.0,  1.0, 104.5,  4.5] },
  { name: 'Bosphorus',           bbox: [28.5, 40.5, 30.0, 42.0] },
  { name: 'Bab el-Mandeb',       bbox: [42.5, 11.0, 44.5, 13.5] },
  { name: 'Taiwan Strait',       bbox: [119.5, 22.0, 121.5, 26.5] },
  { name: 'South China Sea',     bbox: [109.0, 10.0, 118.0, 18.0] },
  { name: 'English Channel',     bbox: [-2.5,  49.5,  2.5, 51.5] },
];

const VESSEL_TYPE_MAP = {
  warship:  [35, 36, 37],
  tanker:   [80, 81, 82, 83, 84, 85, 86, 87, 88, 89],
  cargo:    [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
};

function classifyVessel(typeCode) {
  for (const [type, codes] of Object.entries(VESSEL_TYPE_MAP)) {
    if (codes.includes(typeCode)) return type;
  }
  return 'cargo'; // default
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AISSTREAM_API_KEY not set.' });
  }

  try {
    const vessels = await new Promise((resolve, reject) => {
      const { WebSocket } = require('ws');
      const results = [];
      const seen = new Set();
      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

      const timeout = setTimeout(() => {
        ws.close();
        resolve(results);
      }, 7000); // collect for 7 seconds then return

      ws.on('open', () => {
        ws.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: CHOKEPOINTS.map(c => [
              [c.bbox[1], c.bbox[0]],
              [c.bbox[3], c.bbox[2]]
            ]),
          FilterMessageTypes: ['PositionReport'],
        }));
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const pos = msg.Message?.PositionReport;
          const meta = msg.MetaData;
          if (!pos || !meta) return;

          const mmsi = String(meta.MMSI);
          if (seen.has(mmsi)) return;
          seen.add(mmsi);

          const chokepoint = CHOKEPOINTS.find(c =>
            meta.longitude >= c.bbox[0] && meta.longitude <= c.bbox[2] &&
            meta.latitude  >= c.bbox[1] && meta.latitude  <= c.bbox[3]
          );

          results.push({
            mmsi,
            name:      meta.ShipName?.trim() || `VESSEL ${mmsi.slice(-4)}`,
            lat:       meta.latitude,
            lon:       meta.longitude,
            speed:     pos.Sog,
            heading:   pos.Cog,
            type: classifyVessel(meta.ShipType || pos.ShipAndCargoType || 0),
            chokepoint: chokepoint?.name || 'Unknown',
          });

          if (results.length >= 150) {
            clearTimeout(timeout);
            ws.close();
            resolve(results);
          }
        } catch (e) { /* skip malformed */ }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ vessels, count: vessels.length });

  } catch (err) {
    console.error('Vessel proxy error:', err);
    return res.status(500).json({ error: 'Failed to fetch vessel data.' });
  }
};
