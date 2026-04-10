/**
 * Situation Monitor — Weather Intelligence Proxy
 * Fetches current conditions at strategic hotspots via OpenWeatherMap
 * Keeps OPENWEATHER_API_KEY server-side.
 */

const HOTSPOTS = [
  { name: 'Suez Canal',        lat: 30.02,  lon: 32.57  },
  { name: 'Strait of Hormuz',  lat: 26.56,  lon: 56.25  },
  { name: 'Gaza Strip',        lat: 31.50,  lon: 34.47  },
  { name: 'Kyiv',              lat: 50.45,  lon: 30.52  },
  { name: 'Taiwan Strait',     lat: 24.50,  lon: 119.50 },
  { name: 'Bab el-Mandeb',     lat: 12.80,  lon: 43.50  },
  { name: 'Damascus',          lat: 33.51,  lon: 36.29  },
  { name: 'Tehran',            lat: 35.69,  lon: 51.39  },
  { name: 'South China Sea',   lat: 14.00,  lon: 114.00 },
  { name: 'Strait of Malacca', lat:  2.50,  lon: 101.50 },
  { name: 'Black Sea',         lat: 43.50,  lon: 34.00  },
  { name: 'Bosphorus',         lat: 41.10,  lon: 29.05  },
];

function windDirection(deg) {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function severityFromConditions(weatherId, windKnots, visKm) {
  // WMO weather condition codes: 2xx=thunderstorm, 3xx=drizzle, 5xx=rain, 6xx=snow, 7xx=atmosphere (fog/dust/sand), 8xx=clouds
  if (weatherId >= 200 && weatherId < 300) return 'severe';   // thunderstorm
  if (weatherId >= 700 && weatherId < 800) return 'moderate'; // fog, dust, sand, smoke
  if (windKnots > 34) return 'severe';    // gale force
  if (windKnots > 17) return 'moderate';  // fresh breeze
  if (visKm != null && visKm < 1) return 'moderate'; // low visibility
  return 'normal';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENWEATHER_API_KEY not set.' });

  const results = [];

  for (const spot of HOTSPOTS) {
    try {
      const r = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${spot.lat}&lon=${spot.lon}&appid=${apiKey}&units=metric`,
        { headers: { 'User-Agent': 'SituationMonitor/1.0' } }
      );
      const d = await r.json();

      const windMs    = d.wind?.speed ?? 0;
      const windKnots = Math.round(windMs * 1.944);
      const visKm     = d.visibility != null ? +(d.visibility / 1000).toFixed(1) : null;
      const weatherId = d.weather?.[0]?.id;
      const tempC     = d.main?.temp != null ? Math.round(d.main.temp) : null;

      results.push({
        name:       spot.name,
        lat:        spot.lat,
        lon:        spot.lon,
        temp:       tempC,
        feels:      d.main?.feels_like != null ? Math.round(d.main.feels_like) : null,
        humidity:   d.main?.humidity ?? null,
        conditions: d.weather?.[0]?.description ?? 'unknown',
        icon:       d.weather?.[0]?.icon ?? null,
        wind_knots: windKnots,
        wind_dir:   windDirection(d.wind?.deg),
        wind_gust:  d.wind?.gust != null ? Math.round(d.wind.gust * 1.944) : null,
        visibility: visKm,
        pressure:   d.main?.pressure ?? null,
        clouds:     d.clouds?.all ?? null,
        severity:   severityFromConditions(weatherId, windKnots, visKm),
        weather_id: weatherId,
      });
    } catch (e) {
      console.error(`Weather fetch failed for ${spot.name}:`, e.message);
      results.push({ name: spot.name, lat: spot.lat, lon: spot.lon, error: true });
    }
  }

  // Cache 5 minutes — weather doesn't change second-to-second
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(results);
};
