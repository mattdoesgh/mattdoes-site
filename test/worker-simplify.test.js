// Pins workers/lib/simplify.js — the RDP polygon simplifier shared by the
// geo Worker and scripts/bake-home-geojson.js. Both surfaces depend on the
// same collapse rules (drop degenerate rings, demote single-poly
// MultiPolygons, null out non-polygons), so they are pinned here directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rdp, simplifyRing, simplifyGeometry } from '../workers/lib/simplify.js';

// A closed square ring with a redundant midpoint on one edge.
const SQUARE = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 0]];

test('simplify: rdp() drops collinear midpoints, keeps real corners', () => {
  assert.deepEqual(
    rdp([[0, 0], [1, 0], [2, 0]], 0.01),
    [[0, 0], [2, 0]],
  );
  // A point well off the segment survives any small epsilon.
  assert.deepEqual(
    rdp([[0, 0], [1, 1], [2, 0]], 0.01),
    [[0, 0], [1, 1], [2, 0]],
  );
});

test('simplify: simplifyRing() preserves ring closure', () => {
  const simplified = simplifyRing(SQUARE, 0.01);
  assert.deepEqual(simplified[0], simplified[simplified.length - 1]);
  assert.equal(simplified.length, 5, 'square keeps 4 corners + closing point');
});

test('simplify: simplifyGeometry() trims Polygons and nulls out collapse', () => {
  const poly = simplifyGeometry({ type: 'Polygon', coordinates: [SQUARE] }, 0.01);
  assert.equal(poly.type, 'Polygon');
  assert.equal(poly.coordinates[0].length, 5);

  // A sliver collapses below a valid closed ring → nothing survives.
  const sliver = [[0, 0], [1, 0.0001], [2, 0], [0, 0]];
  assert.equal(simplifyGeometry({ type: 'Polygon', coordinates: [sliver] }, 0.01), null);
  assert.equal(simplifyGeometry({ type: 'Point', coordinates: [0, 0] }, 0.01), null);
});

test('simplify: single-polygon MultiPolygon is demoted to Polygon', () => {
  const demoted = simplifyGeometry({ type: 'MultiPolygon', coordinates: [[SQUARE]] }, 0.01);
  assert.equal(demoted.type, 'Polygon');

  const kept = simplifyGeometry(
    { type: 'MultiPolygon', coordinates: [[SQUARE], [SQUARE.map(([x, y]) => [x + 10, y])]] },
    0.01,
  );
  assert.equal(kept.type, 'MultiPolygon');
  assert.equal(kept.coordinates.length, 2);
});
