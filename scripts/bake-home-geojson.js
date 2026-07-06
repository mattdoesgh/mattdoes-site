// bake-home-geojson.js — produce static/home.geojson from siteConfig.geo.home.
//
// Hits Nominatim once with the configured lat/lng, walks up to the city
// admin level (admin_level 8, falling back to 6 then 4 if no city polygon
// is available), fetches the boundary as GeoJSON, simplifies it with the
// shared Ramer–Douglas–Peucker (workers/lib/simplify.js), and writes
// static/home.geojson.
//
// Usage:
//   node scripts/bake-home-geojson.js
//   node scripts/bake-home-geojson.js --from path/to/source.geojson
//
// The --from flag skips the network call and reads a Polygon /
// MultiPolygon / Feature / FeatureCollection from a local file. Useful
// when running in environments with no Nominatim access (sandboxes,
// air-gapped CI). The polygon is still simplified before write.
//
// Env:
//   GEO_TOLERANCE  — RDP epsilon in degrees (default 0.0008 ≈ 80 m).
//                    Bigger = simpler polygon, smaller file.
//   GEO_USER_AGENT — overrides the User-Agent string sent to Nominatim.
//
// Nominatim's usage policy requires a meaningful User-Agent and
// no more than one request per second. This script makes ≤2 requests
// per run, which is fine. See https://operations.osmfoundation.org/policies/nominatim/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../site.config.js';
import { simplifyGeometry } from '../workers/lib/simplify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const OUT       = path.join(ROOT, 'static', 'home.geojson');

const TOLERANCE = Number(process.env.GEO_TOLERANCE) || 0.0008;
const USER_AGENT = process.env.GEO_USER_AGENT
  || 'mattdoes-site-bake/1.0 (+https://mattdoes.online)';

// Admin levels to try, in order. 8 = city/town in most countries.
// 6 = county-equivalent. 4 = state/province. We accept the first one
// that comes back with a polygon, so a coordinate that doesn't fall
// inside an admin_level=8 boundary still produces something usable.
const ADMIN_LEVELS = [8, 6, 4];

async function nominatim(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept':     'application/json',
    },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status} for ${url}`);
  return res.json();
}

async function fetchAdminPolygon(lat, lng, level) {
  const url = `https://nominatim.openstreetmap.org/reverse`
    + `?lat=${lat}&lon=${lng}`
    + `&format=jsonv2`
    + `&zoom=${level === 8 ? 10 : level === 6 ? 8 : 5}`
    + `&polygon_geojson=1`
    + `&addressdetails=1`;
  const data = await nominatim(url);
  if (!data || !data.geojson) return null;
  const t = data.geojson.type;
  if (t !== 'Polygon' && t !== 'MultiPolygon') return null;
  return {
    geometry: data.geojson,
    label:    data.display_name || '',
    osmId:    data.osm_id,
    level,
  };
}

// RDP simplification lives in workers/lib/simplify.js, shared with the geo
// Worker so both surfaces trim polygons with the same shapes.

function countPoints(g) {
  if (g.type === 'Polygon') return g.coordinates.reduce((n, r) => n + r.length, 0);
  if (g.type === 'MultiPolygon') {
    return g.coordinates.reduce((n, poly) => n + poly.reduce((m, r) => m + r.length, 0), 0);
  }
  return 0;
}

// ── main ───────────────────────────────────────────────────────────────
const home = siteConfig.geo?.home;
if (!home || home.lat == null || home.lng == null) {
  console.error('siteConfig.geo.home is not set; nothing to bake.');
  process.exit(1);
}

const fromArgIdx = process.argv.indexOf('--from');
const fromPath = fromArgIdx > -1 ? process.argv[fromArgIdx + 1] : null;

console.log(`→ Baking ${home.label || 'home'} (${home.lat}, ${home.lng})`);

let result = null;

if (fromPath) {
  console.log(`  reading from ${fromPath}…`);
  const raw = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
  // Accept Polygon, MultiPolygon, Feature, or FeatureCollection.
  let geom = null, label = home.label || '';
  if (raw.type === 'FeatureCollection') {
    const f = raw.features?.[0];
    geom  = f?.geometry || null;
    label = f?.properties?.NAME || f?.properties?.name || label;
  } else if (raw.type === 'Feature') {
    geom  = raw.geometry || null;
    label = raw.properties?.NAME || raw.properties?.name || label;
  } else if (raw.type === 'Polygon' || raw.type === 'MultiPolygon') {
    geom = raw;
  }
  if (!geom) {
    console.error('✗ Could not extract a polygon from the source file.');
    process.exit(2);
  }
  result = { geometry: geom, label, osmId: null, level: null };
} else {
  for (const level of ADMIN_LEVELS) {
    console.log(`  trying admin_level=${level}…`);
    try {
      const hit = await fetchAdminPolygon(home.lat, home.lng, level);
      if (hit) { result = hit; break; }
    } catch (err) {
      console.warn(`  admin_level=${level} failed: ${err.message}`);
    }
    // 1 req/sec etiquette.
    await new Promise(r => setTimeout(r, 1100));
  }

  if (!result) {
    console.error('✗ No polygon returned from Nominatim at any admin level.');
    console.error('  You can rerun later, or hand-author static/home.geojson,');
    console.error('  or pass --from path/to/file.geojson to bake from a local source.');
    process.exit(2);
  }
}

const before = countPoints(result.geometry);
const simplified = simplifyGeometry(result.geometry, TOLERANCE);
if (!simplified) {
  console.error('✗ Simplification collapsed the polygon; try a smaller GEO_TOLERANCE.');
  process.exit(2);
}
const after = countPoints(simplified);

const out = {
  type: 'Feature',
  properties: {
    label:      result.label,
    osmId:      result.osmId,
    adminLevel: result.level,
    bakedAt:    new Date().toISOString(),
    tolerance:  TOLERANCE,
    home:       { lat: home.lat, lng: home.lng, label: home.label || '' },
  },
  geometry: simplified,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));

const sizeKb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`✓ wrote ${path.relative(ROOT, OUT)}  (${after}/${before} points, ${sizeKb} KB)`);
