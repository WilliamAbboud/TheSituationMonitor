# Situation Monitor

Real-time geopolitical intelligence dashboard built on CesiumJS 1.104. Single-file web app deployed on Vercel.

## Features

- Interactive 3D/2D globe with four map presets (Satellite, Google Hybrid, ESRI Street, Ocean)
- Custom tile URL support for additional basemaps
- Lat/lon coordinate overlay with full DMS formatting (degrees, minutes, seconds) — scales from 30° intervals down to 5" at maximum zoom
- Graticule (grid lines) toggle
- Multi-timezone clock panel with customizable clocks (add/remove, 12h/24h toggle)
- Live news feed via NewsAPI (server-side proxy keeps API key secure)
- OSINT/X feed panel for breaking intelligence
- World Bank economic indicators
- Geopolitical incident markers with severity-based scaling
- Weather overlay support (clouds, temperature, precipitation, wind)
- Country boundary overlays
- Globe appearance controls (brightness, contrast, saturation, hue)

## Project Structure

```
globalwatch-v3.html   # Main application (single-file: HTML + CSS + JS)
vercel.json           # Vercel deployment config (rewrites, security headers, function settings)
api/news.js           # Serverless proxy for NewsAPI (keeps API key server-side)
README.md             # This file
```

## Deployment (Vercel)

### Prerequisites

1. A [Vercel](https://vercel.com) account
2. A [NewsAPI](https://newsapi.org) key (free tier: 100 requests/day)
3. A [Sentry](https://sentry.io) account for error monitoring (free tier available)

### Steps

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel (vercel.com > New Project > Import Git Repository).
3. Add environment variables in Vercel project settings:
   - `NEWS_API_KEY` — your NewsAPI key
4. Update the Sentry DSN in `globalwatch-v3.html`:
   - Search for `YOUR_SENTRY_DSN` and replace with your Sentry project DSN
   - Get your DSN from: sentry.io > Project Settings > Client Keys (DSN)
5. Deploy. Vercel will serve `globalwatch-v3.html` at the root (`/`) via the rewrite in `vercel.json`.

### Security Headers

The `vercel.json` config applies these security headers to all routes:

- `X-Frame-Options: DENY` — prevents clickjacking (page cannot be framed by anyone)
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` — legacy XSS filter
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage
- `Permissions-Policy` — disables camera, microphone, geolocation, payment APIs
- `Strict-Transport-Security` — enforces HTTPS with 2-year max-age + preload

## Error Monitoring

Sentry is integrated for production error reporting. The SDK loads from Sentry's CDN and captures unhandled exceptions, promise rejections, and performance traces (sampled at 20%). Local/file:// errors are filtered out automatically.

To enable: replace `YOUR_SENTRY_DSN` in the HTML file with your actual Sentry DSN.

## Map Sources & Attribution

| Preset | Source | Attribution Required |
|--------|--------|---------------------|
| Satellite | ESRI World Imagery | Yes — "Powered by Esri" |
| Google Hybrid | Google Maps | Yes — Google attribution |
| Map | ESRI World Street Map | Yes — "Powered by Esri" |
| Ocean | ESRI Ocean Base + Reference | Yes — "Powered by Esri" |

**Important:** See the Tile Source Compliance section below.

## Tile Source Compliance

### ESRI ArcGIS Tiles

ESRI's `server.arcgisonline.com` tile endpoints are publicly accessible but governed by ESRI's Terms of Use. For production use:

- **Free tier:** Available through ArcGIS Location Platform (2M tiles/month free, then $0.15/1000)
- **Attribution:** "Powered by Esri" must be displayed on the map
- **Recommendation:** Register for an ArcGIS Developer account and use their official basemap service with an API key for full compliance

### Google Maps Tiles

Direct tile access from `mt1.google.com` is **not officially sanctioned** by Google's Terms of Service. Google requires all Maps usage to go through the official Google Maps Platform APIs with an API key.

- **Risk:** URLs may be blocked without notice
- **Recommendation:** Either obtain a Google Maps Platform API key, or replace with an open-source alternative (e.g., OpenStreetMap, Mapbox, Stadia Maps)

### Compliant Alternatives

If you need fully open-license basemaps with no API key:
- OpenStreetMap: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (requires attribution)
- Stadia Maps (free tier available with API key)

## Performance Notes

- **File size:** ~248KB (single file, no build step)
- **External dependencies:** CesiumJS (~32MB loaded from CDN), Sentry SDK (~30KB), Google Fonts
- **CesiumJS is the dominant load** — initial page load will be 2-4 seconds depending on connection speed
- **Tile requests:** Each map pan/zoom generates tile requests to the basemap provider
- **Memory:** CesiumJS typically uses 100-300MB of browser memory depending on zoom level and tile cache
- **Recommended browser:** Chrome or Edge (best WebGL performance). Firefox and Safari are supported.

## Browser Compatibility

- Chrome 90+ (recommended)
- Firefox 90+
- Safari 15+
- Edge 90+

Requires WebGL support. Mobile browsers work but the interface is optimized for desktop.

## Controls Quick Reference

- **Map presets:** Globe Controls panel > Map Style buttons
- **Graticule:** Toggle in Globe Controls panel
- **Lat/Lon overlay:** Toggle in Globe Controls panel
- **2D/3D:** Toggle in Globe Controls panel
- **Clocks:** Click "+" to add, hover clock to remove
- **12h/24h:** Toggle via clock settings
- **Weather:** Enable weather overlays via the weather panel
- **Zoom:** Scroll wheel or pinch. Double-click to zoom to location.
- **Rotate:** Click and drag. Right-click drag to tilt.
