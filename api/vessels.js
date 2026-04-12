/**
 * Situation Monitor — Vessel Tracking Proxy
 * aisstream.io WebSocket: 15 strategic regions, type detection from ShipStaticData
 */
const CHOKEPOINTS = [
  { name: 'Suez Canal',        bbox: [30.5, 29.0,  33.5, 32.0] },
  { name: 'Strait of Hormuz',  bbox: [54.5, 25.0,  58.5, 27.5] },
  { name: 'Strait of Malacca', bbox: [98.5,  0.5, 105.0,  5.5] },
  { name: 'Singapore',         bbox: [103.5, 1.0, 104.8,  1.8] },
  { name: 'Bosphorus',         bbox: [28.0, 40.5,  30.5, 42.5] },
  { name: 'Bab el-Mandeb',     bbox: [42.0, 10.5,  45.5, 14.0] },
  { name: 'Taiwan Strait',     bbox: [119.0,21.5, 122.5, 27.0] },
  { name: 'South China Sea',   bbox: [108.0, 9.0, 120.0, 20.0] },
  { name: 'English Channel',   bbox: [-3.0, 49.0,   3.0, 52.0] },
  { name: 'Mediterranean',     bbox: [-2.0, 35.0,  18.0, 44.5] },
  { name: 'Red Sea',           bbox: [32.0, 14.5,  44.0, 28.5] },
  { name: 'Persian Gulf',      bbox: [47.5, 23.5,  57.0, 27.5] },
  { name: 'North Sea',         bbox: [1.5,  51.0,  11.0, 58.5] },
  { name: 'Gibraltar',         bbox: [-7.0, 35.0,  -4.0, 37.5] },
  { name: 'Luzon Strait',      bbox: [119.0,18.0, 124.5, 23.0] },
];

const TYPE_GROUPS = {
  tanker:    [80,81,82,83,84,85,86,87,88,89],
  cargo:     [70,71,72,73,74,75,76,77,78,79],
  warship:   [35,36],
  passenger: [60,61,62,63,64,65,66,67,68,69],
  fishing:   [30,32],
  tug:       [21,22,31],
  highspeed: [40,41,42,43,44,45,46,47,48,49],
};

const NAV_STATUS = {
  0:'Under Way', 1:'Anchored', 2:'Not Under Command', 3:'Restricted Manoeuvring',
  5:'Moored', 6:'Aground', 8:'Under Way Sailing', 15:'Unknown',
};

function classifyVessel(code) {
  const n = Number(code);
  if (!n) return 'unknown';
  for (const [type, codes] of Object.entries(TYPE_GROUPS)) {
    if (codes.includes(n)) return type;
  }
  return 'cargo';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AISSTREAM_API_KEY not set.' });

  try {
    const vessels = await new Promise((resolve, reject) => {
      const { WebSocket } = require('ws');
      const results = [];
      const seen = new Set();
      const shipTypes = {};

      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      const timeout = setTimeout(() => { ws.close(); resolve(results); }, 10000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: CHOKEPOINTS.map(c => [
            [c.bbox[1], c.bbox[0]],
            [c.bbox[3], c.bbox[2]],
          ]),
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const meta = msg.MetaData;
          if (!meta) return;

          if (msg.MessageType === 'ShipStaticData') {
            const t = msg.Message?.ShipStaticData?.Type;
            if (t) shipTypes[String(meta.MMSI)] = t;
            return;
          }

          const pos = msg.Message?.PositionReport;
          if (!pos) return;
          const mmsi = String(meta.MMSI);
          if (seen.has(mmsi)) return;
          seen.add(mmsi);

          const typeCode = shipTypes[mmsi] || meta.ShipType || 0;
          const navStatus = pos.NavigationalStatus ?? 15;
          const chokepoint = CHOKEPOINTS.find(c =>
            meta.longitude >= c.bbox[0] && meta.longitude <= c.bbox[2] &&
            meta.latitude  >= c.bbox[1] && meta.latitude  <= c.bbox[3]
          );

          results.push({
            mmsi,
            name:       meta.ShipName?.trim() || `VESSEL ${mmsi.slice(-4)}`,
            lat:        meta.latitude,
            lon:        meta.longitude,
            speed:      +(pos.Sog || 0).toFixed(1),
            heading:    pos.TrueHeading < 360 ? pos.TrueHeading : (pos.Cog || 0),
            type:       classifyVessel(typeCode),
            typeCode,
            status:     NAV_STATUS[navStatus] || 'Unknown',
            chokepoint: chokepoint?.name || 'Open Ocean',
          });

          if (results.length >= 250) { clearTimeout(timeout); ws.close(); resolve(results); }
        } catch (_) {}
      });

      ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ vessels, count: vessels.length });
  } catch (err) {
    console.error('Vessel error:', err);
    return res.status(500).json({ error: 'Failed to fetch vessel data.' });
  }
};
