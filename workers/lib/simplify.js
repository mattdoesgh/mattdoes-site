// workers/lib/simplify.js — Ramer–Douglas–Peucker polygon simplification.
//
// Pure geometry, no bindings. The geo Worker uses it for Nominatim
// polygons. The home-map bake script is not in this repo.
//
// Operates on lon/lat pairs. Tolerance is in degrees; treating ε uniformly
// for lat and lon is fine at city scale.
//
// ⚠ Deploy coupling: bundled into the geo Worker — editing this file means
// redeploying all Workers (`npm run deploy:workers`).

function perpDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ramer–Douglas–Peucker on an open polyline.
 *
 * @param {[number, number][]} points
 * @param {number} eps  tolerance in degrees
 * @returns {[number, number][]}
 */
export function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  let maxDist = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; idx = i; }
  }
  if (maxDist > eps) {
    const left  = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx),        eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

/**
 * Simplify one polygon ring. Rings are closed; the repeated last point is
 * preserved through simplification.
 *
 * @param {[number, number][]} ring
 * @param {number} eps
 * @returns {[number, number][]}
 */
export function simplifyRing(ring, eps) {
  if (ring.length < 4) return ring;
  const closed = ring[0][0] === ring[ring.length - 1][0]
              && ring[0][1] === ring[ring.length - 1][1];
  const open = closed ? ring.slice(0, -1) : ring;
  const simplified = rdp(open, eps);
  if (closed) simplified.push(simplified[0]);
  return simplified;
}

// A simplified ring needs at least 4 points (3 unique + the repeat) to
// define a closed polygon. Anything shorter has collapsed into a line or a
// single point and would render as visual noise — drop it.
const isValidRing = (r) => r.length >= 4;

/**
 * Simplify a GeoJSON Polygon / MultiPolygon, dropping rings (and polygons)
 * that collapse below a valid closed ring. A MultiPolygon with one
 * surviving polygon is demoted to Polygon. Returns `null` when nothing
 * survives, or for non-polygon geometry types.
 *
 * @param {{ type: string, coordinates: any[] }} g
 * @param {number} eps
 * @returns {{ type: string, coordinates: any[] } | null}
 */
export function simplifyGeometry(g, eps) {
  if (g.type === 'Polygon') {
    const rings = g.coordinates.map(r => simplifyRing(r, eps)).filter(isValidRing);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  if (g.type === 'MultiPolygon') {
    const polys = g.coordinates
      .map(p => p.map(r => simplifyRing(r, eps)).filter(isValidRing))
      .filter(p => p.length > 0);
    if (!polys.length) return null;
    if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] };
    return { type: 'MultiPolygon', coordinates: polys };
  }
  return null;
}
