// Audit backlog: "Privacy behavior — Stored-data inspection and
// travel/location cache behavior tests". Covers audit finding #3.
//
// The tweaks panel tells visitors their coordinates are not stored. This
// test enforces that claim by driving geo-background.js in jsdom and
// inspecting localStorage, plus a source-level guard on saveCachedMine().

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeoBackground, geoSource } from './helpers/geo-dom.js';

const STORAGE_KEY = 'mdo:geo:v1';

// ── stored-data inspection ──────────────────────────────────────────────
test('after a "mine" lookup, only {feature, savedAt} is persisted', async () => {
  const coords = { latitude: 29.760427, longitude: -95.369804 }; // precise Houston
  const w = loadGeoBackground({ coords });

  const ok = await w.geoBackground.useMine();
  assert.equal(ok, true, 'the mine lookup should succeed with the stubbed worker');

  const raw = w.localStorage.getItem(STORAGE_KEY);
  assert.ok(raw, 'a successful mine lookup should cache the derived polygon');

  const obj = JSON.parse(raw);
  // The ONLY two keys allowed: the derived polygon and a timestamp.
  assert.deepEqual(Object.keys(obj).sort(), ['feature', 'savedAt'],
    'cached object must contain only {feature, savedAt}');

  // Nothing coordinate-shaped — no lat/lng key, no key naming a coordinate.
  assert.ok(!('lat' in obj) && !('lng' in obj) && !('key' in obj) &&
            !('coords' in obj) && !('coordinates' in obj),
    'cached object must not store coordinates');

  // Defense in depth: the precise coordinates must not appear anywhere in
  // the serialized cache (the rounded coords are used only for the request).
  const serialized = JSON.stringify(obj);
  assert.ok(!serialized.includes('29.76') && !serialized.includes('95.36') &&
            !serialized.includes('29.8') && !serialized.includes('95.4'),
    'the visitor coordinates must not be persisted in any form');
});

test('the cached location is clearable via the public API', async () => {
  const coords = { latitude: 40.7128, longitude: -74.006 };
  const w = loadGeoBackground({ coords });

  await w.geoBackground.useMine();
  assert.ok(w.localStorage.getItem(STORAGE_KEY), 'precondition: cache populated');

  // An unrelated key must survive — clearCache only wipes the geo cache.
  w.localStorage.setItem('mdo:tweaks:v1', '{"dark":true}');

  w.geoBackground.clearCache();
  assert.equal(w.localStorage.getItem(STORAGE_KEY), null,
    'clearCache() must remove the cached location data');
  assert.equal(w.localStorage.getItem('mdo:tweaks:v1'), '{"dark":true}',
    'clearCache() must not touch unrelated preferences');
});

test('switching the map away from "mine" clears the cached location', async () => {
  const coords = { latitude: 51.5074, longitude: -0.1278 };
  const w = loadGeoBackground({ coords });

  await w.geoBackground.useMine();
  assert.ok(w.localStorage.getItem(STORAGE_KEY), 'precondition: cache populated');

  w.geoBackground.useHome();
  assert.equal(w.localStorage.getItem(STORAGE_KEY), null,
    'reverting to the home map must clear stored location data');
});

// ── source-level guard ──────────────────────────────────────────────────
test('saveCachedMine() persists only the feature + timestamp', () => {
  const src = geoSource();
  // Isolate the saveCachedMine function body.
  const m = src.match(/function saveCachedMine\([^)]*\)\s*\{([\s\S]*?)\n {2}\}/);
  assert.ok(m, 'could not locate saveCachedMine() in geo-background.js');
  const body = m[1];

  // It must write the storage key with exactly { feature, savedAt }.
  assert.match(body, /setItem\(\s*STORAGE_KEY/,
    'saveCachedMine must write the geo storage key');
  assert.match(body, /feature\s*,\s*savedAt/,
    'saveCachedMine must persist { feature, savedAt }');

  // It must NOT persist a coordinate-derived key.
  assert.ok(!/\blat\b/.test(body) && !/\blng\b/.test(body) &&
            !/\bkey\b\s*:/.test(body),
    'saveCachedMine must not persist any coordinate-derived value');
});

test('the storage TTL is the privacy-bounded 7 days, not 30', () => {
  const src = geoSource();
  const m = src.match(/STORAGE_TTL_MS\s*=\s*([^;]+);/);
  assert.ok(m, 'could not find STORAGE_TTL_MS');
  // 7 days in ms.
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  // Evaluate the simple arithmetic expression safely.
  const value = Function(`"use strict";return (${m[1]});`)();
  assert.equal(value, sevenDays,
    'the cached-location TTL must be 7 days (bounds stale-city exposure)');
});
