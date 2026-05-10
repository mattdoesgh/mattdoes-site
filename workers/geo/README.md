# mattdoes-geo

Tiny Cloudflare Worker that powers the animated GeoJSON background's
opt-in upgrade. The static site ships with `static/home.geojson`
(Houston) and renders that for everyone. When a visitor opts in via
the tweaks panel and grants geolocation, `static/geo-background.js`
calls this worker:

```
GET /api/geo/lookup?lat=29.7&lng=-95.4
→ { feature: { type: 'Feature', geometry: {…}, properties: {…} } }
```

The worker reverse-geocodes the coords against Nominatim, walks up
admin levels (8 → 6 → 4) until it finds a polygon, simplifies it
inline (Ramer–Douglas–Peucker), and caches the result in KV for 7
days keyed by rounded coords. Coords never get persisted — only the
returned polygon does.

## Deploy

```
cd workers/geo
npx wrangler kv namespace create GEO_CACHE   # one-time
# paste returned id into wrangler.toml under [[kv_namespaces]]
npx wrangler deploy
```

## CORS / origin

Locked to `https://mattdoes.online`. Edit `ALLOWED_ORIGIN` in
`src/index.js` for staging.

## Nominatim policy

We send a descriptive User-Agent. Per the OSM operations policy
the worker keeps upstream calls bounded by:

- KV cache (7 days per coord cell) absorbs repeat visitors
- Cloudflare edge cache (`s-maxage=86400`) absorbs concurrent traffic
- A 60s in-flight lock dedupes simultaneous misses

So even at high traffic, Nominatim sees at most one request per
unique metro per week.
