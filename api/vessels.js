// api/vessels.js — Global vessel tracking via aisstream.io
// Covers all major coastal regions and shipping lanes worldwide

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const API_KEY = process.env.AISSTREAM_API_KEY;
  if (!API_KEY) { res.status(500).json({ error: 'AISSTREAM_API_KEY not set' }); return; }

  // Global coverage: all major coastal regions and shipping lanes
  // Format: [lon_min, lat_min, lon_max, lat_max] → converted to aisstream [[lat_min,lon_min],[lat_max,lon_max]]
  const REGIONS = [
    // ── EUROPE ──────────────────────────────────────────────────────────────
    { name: 'English Channel',      bbox: [-5.0, 48.5,   3.5, 52.5] },
    { name: 'North Sea',            bbox: [ -2.0, 50.5,  12.0, 60.0] },
    { name: 'Baltic Sea',           bbox: [  9.5, 53.5,  30.0, 66.0] },
    { name: 'Norwegian Sea',        bbox: [  0.0, 57.0,  20.0, 71.5] },
    { name: 'Mediterranean West',   bbox: [ -6.0, 35.0,  16.0, 44.5] },
    { name: 'Mediterranean East',   bbox: [ 16.0, 30.0,  37.0, 42.5] },
    { name: 'Black Sea',            bbox: [ 27.5, 40.5,  42.0, 47.0] },
    { name: 'Bosphorus',            bbox: [ 28.0, 40.5,  30.5, 42.5] },
    { name: 'Iberian Atlantic',     bbox: [-10.0, 35.0,  -1.0, 45.0] },

    // ── MIDDLE EAST / INDIAN OCEAN ───────────────────────────────────────
    { name: 'Suez Canal',           bbox: [ 30.5, 29.0,  33.5, 32.5] },
    { name: 'Red Sea',              bbox: [ 32.0, 11.0,  44.0, 30.0] },
    { name: 'Bab el-Mandeb',        bbox: [ 42.0, 10.5,  45.5, 14.0] },
    { name: 'Gulf of Aden',         bbox: [ 43.0, 10.0,  54.0, 15.5] },
    { name: 'Strait of Hormuz',     bbox: [ 54.5, 24.5,  58.5, 27.5] },
    { name: 'Persian Gulf',         bbox: [ 47.5, 23.5,  57.0, 27.5] },
    { name: 'Arabian Sea',          bbox: [ 55.0, 12.0,  78.0, 26.0] },
    { name: 'Indian Ocean West',    bbox: [ 39.0, -30.0, 80.0,  10.0] },
    { name: 'Bay of Bengal',        bbox: [ 78.0,  5.0,  100.0, 23.0] },
    { name: 'Indian Ocean East',    bbox: [ 80.0, -40.0, 115.0,  5.0] },

    // ── SOUTHEAST ASIA / PACIFIC ─────────────────────────────────────────
    { name: 'Strait of Malacca',    bbox: [ 98.5,  0.5, 105.0,  6.5] },
    { name: 'Singapore',            bbox: [103.5,  1.0, 104.8,  1.8] },
    { name: 'South China Sea',      bbox: [105.0,  0.0, 122.0, 23.0] },
    { name: 'Taiwan Strait',        bbox: [119.0, 21.5, 122.5, 27.0] },
    { name: 'East China Sea',       bbox: [118.0, 25.0, 132.0, 35.0] },
    { name: 'Sea of Japan',         bbox: [127.0, 32.0, 142.0, 45.0] },
    { name: 'Luzon Strait',         bbox: [119.0, 18.0, 124.5, 23.0] },
    { name: 'Indonesia / Java Sea', bbox: [106.0, -9.5, 116.0,  -4.5] },
    { name: 'Philippine Sea',       bbox: [124.0,  8.0, 138.0, 22.0] },
    { name: 'Australia East',       bbox: [150.0,-38.0, 155.0, -10.0] },
    { name: 'Australia West',       bbox: [113.0,-36.0, 122.0, -13.0] },
    { name: 'Australia South',      bbox: [117.0,-38.0, 139.0, -28.0] },

    // ── AFRICA ───────────────────────────────────────────────────────────
    { name: 'West Africa',          bbox: [-18.0, -6.0,  10.0, 15.0] },
    { name: 'Cape of Good Hope',    bbox: [  9.0,-36.0,  30.0,-25.0] },
    { name: 'East Africa',          bbox: [ 38.0,-15.0,  52.0,  2.0] },

    // ── AMERICAS ─────────────────────────────────────────────────────────
    { name: 'US East Coast',        bbox: [-80.0, 24.0, -65.0, 47.0] },
    { name: 'Gulf of Mexico',       bbox: [-98.0, 17.0, -80.0, 31.0] },
    { name: 'Panama Canal',         bbox: [-80.5,  7.5, -77.0, 10.5] },
    { name: 'Caribbean',            bbox: [-90.0, 10.0, -59.0, 24.0] },
    { name: 'US West Coast',        bbox: [-130.0, 23.0, -115.0, 50.0] },
    { name: 'South America East',   bbox: [-55.0, -37.0, -32.0,   6.0] },
    { name: 'South America West',   bbox: [-82.0, -58.0, -66.0,   2.0] },
    { name: 'Strait of Magellan',   bbox: [-80.0, -57.0, -65.0, -50.0] },
    { name: 'Canada East',          bbox: [-70.0,  44.0, -52.0,  52.0] },

    // ── ARCTIC / NORTH ATLANTIC ──────────────────────────────────────────
    { name: 'North Atlantic',       bbox: [-60.0, 40.0, -10.0, 58.0] },
    { name: 'Iceland / Faroe',      bbox: [-30.0, 60.0,  -5.0, 68.0] },
  ];

  // Convert bbox [lon_min, lat_min, lon_max, lat_max]
  // to aisstream format [[lat_min, lon_min], [lat_max, lon_max]]
  const bboxes = REGIONS.map(r => [
    [r.bbox[1], r.bbox[0]],
    [r.bbox[3], r.bbox[2]],
  ]);

  const shipTypes = {};   // mmsi → typeCode from ShipStaticData
  const vessels   = {};   // mmsi → vessel data
  const MAX_VESSELS = 600;

  function classifyVessel(typeCode) {
    if (!typeCode) return 'unknown';
    if (typeCode >= 80 && typeCode <= 89) return 'tanker';
    if (typeCode >= 70 && typeCode <= 79) return 'cargo';
    if (typeCode >= 60 && typeCode <= 69) return 'passenger';
    if (typeCode >= 30 && typeCode <= 32) return 'fishing';
    if (typeCode === 52 || typeCode === 53) return 'tug';
    if (typeCode >= 40 && typeCode <= 49) return 'highspeed';
    if (typeCode >= 35 && typeCode <= 36) return 'warship';
    if (typeCode >= 20 && typeCode <= 29) return 'unknown'; // WIG
    if (typeCode >= 50 && typeCode <= 59) return 'tug';
    return 'unknown';
  }

  const NAV_STATUS = {
    0:'Under Way', 1:'Anchored', 2:'Not Under Command', 3:'Restricted Manoeuvrability',
    4:'Constrained By Draught', 5:'Moored', 6:'Aground', 7:'Engaged in Fishing',
    8:'Under Way (Sailing)', 15:'Not Defined',
  };

  await new Promise((resolve) => {
    let done = false;
    const ws = new (require('ws'))('wss://stream.aisstream.io/v0/stream');

    const timer = setTimeout(() => {
      if (!done) { done = true; ws.terminate(); resolve(); }
    }, 12000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        APIKey: API_KEY,
        BoundingBoxes: bboxes,
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const mtype = msg.MessageType;
        const meta  = msg.MetaData || {};
        const mmsi  = String(meta.MMSI || '');
        if (!mmsi) return;

        if (mtype === 'ShipStaticData') {
          const st = msg.Message?.ShipStaticData;
          if (st?.Type) shipTypes[mmsi] = st.Type;
          // Backfill type for already-seen vessel
          if (vessels[mmsi] && st?.Type) {
            vessels[mmsi].typeCode = st.Type;
            vessels[mmsi].type     = classifyVessel(st.Type);
          }
          return;
        }

        if (mtype === 'PositionReport') {
          if (Object.keys(vessels).length >= MAX_VESSELS) return;
          const pos = msg.Message?.PositionReport;
          if (!pos) return;
          const lat = pos.Latitude,  lon = pos.Longitude;
          if (!lat || !lon) return;
          if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

          const typeCode = shipTypes[mmsi] || pos.ShipAndCargoType || 0;
          vessels[mmsi] = {
            mmsi,
            name:      (meta.ShipName || '').trim() || `Vessel ${mmsi.slice(-4)}`,
            lat,
            lon,
            speed:     pos.Sog  ?? 0,
            heading:   pos.TrueHeading !== 511 ? (pos.TrueHeading ?? pos.Cog ?? 0) : (pos.Cog ?? 0),
            typeCode,
            type:      classifyVessel(typeCode),
            status:    NAV_STATUS[pos.NavigationalStatus] || 'Unknown',
            flag:      meta.ShipName ? '' : '',
          };
        }
      } catch (e) { /* ignore parse errors */ }
    });

    ws.on('error', () => {
      if (!done) { done = true; clearTimeout(timer); ws.terminate(); resolve(); }
    });

    ws.on('close', () => {
      if (!done) { done = true; clearTimeout(timer); resolve(); }
    });
  });

  const list = Object.values(vessels);
  res.status(200).json({ vessels: list, count: list.length });
}
