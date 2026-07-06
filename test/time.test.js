// lib/time.js — the Node-side owner of the CT wall-clock primitives Intake
// uses (frontmatter re-anchoring, thought timestamps, thought ids). Three
// concerns:
//   1. Unit tests of ctWallClockToDate across the CST/CDT boundary — the
//      whole reason the module exists is DST-aware wall-clock → instant.
//   2. Thought-id parity: ctYmd/ctHm must keep producing exactly what the
//      old fmtDate('iso')/fmtTime round-trip through templates/_helpers.js
//      produced, or existing `t-YYYYMMDD-HHMM` permalinks/feed ids break.
//   3. Copy sync: templates/_helpers.js ships to the browser and cannot
//      import lib/time.js, so it keeps a private duplicate of tzParts.
//      Pin the two source bodies together so they can't drift (same
//      pattern as test/contrast.test.js pinning theme-boot's palette).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ctWallClockToDate, ctYmd, ctHm, tzParts } from '../lib/time.js';
import { fmtDate, fmtTime } from '../templates/_helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

test('ctWallClockToDate maps CT wall-clock to the correct UTC instant', () => {
  // CST (UTC-6): Jan 15 2026 09:30 CT == 15:30 UTC.
  assert.equal(
    ctWallClockToDate(2026, 1, 15, 9, 30).toISOString(),
    '2026-01-15T15:30:00.000Z',
  );
  // CDT (UTC-5): Jul 4 2026 09:30 CT == 14:30 UTC.
  assert.equal(
    ctWallClockToDate(2026, 7, 4, 9, 30).toISOString(),
    '2026-07-04T14:30:00.000Z',
  );
  // Midnight defaults: bare date lands on CT midnight, not UTC midnight.
  assert.equal(
    ctWallClockToDate(2026, 3, 1).toISOString(),
    '2026-03-01T06:00:00.000Z',
  );
});

test('ctWallClockToDate round-trips through tzParts across DST', () => {
  // Wall-clock in → same wall-clock back out, either side of both 2026
  // transitions (spring forward Mar 8, fall back Nov 1).
  for (const [y, mo, d, h, mi] of [
    [2026, 3, 7, 23, 59], [2026, 3, 8, 12, 0],
    [2026, 10, 31, 23, 59], [2026, 11, 1, 12, 0],
  ]) {
    const parts = tzParts(ctWallClockToDate(y, mo, d, h, mi));
    assert.deepEqual(
      [parts.year, parts.month, parts.day, parts.hour, parts.minute],
      [y, mo, d, h, mi],
    );
  }
});

test('ctYmd/ctHm match the fmtDate/fmtTime round-trip they replaced', () => {
  const instants = [
    ctWallClockToDate(2026, 1, 15, 9, 30),   // CST
    ctWallClockToDate(2026, 7, 4, 14, 5),    // CDT
    ctWallClockToDate(2026, 3, 8, 3, 0),     // just after spring-forward
    ctWallClockToDate(2026, 11, 1, 1, 30),   // fall-back morning
    ctWallClockToDate(2026, 6, 20, 0, 0),    // CT midnight (Intl "24" case)
    new Date('2026-04-17T04:59:00Z'),        // UTC date != CT date
  ];
  for (const d of instants) {
    assert.equal(ctYmd(d), fmtDate(d, 'iso').replace(/-/g, ''), String(d));
    assert.equal(ctHm(d), fmtTime(d).replace(':', ''), String(d));
  }
  // Falsy/invalid inputs degrade to '' exactly like the old round-trip.
  assert.equal(ctYmd(null), '');
  assert.equal(ctHm(undefined), '');
  assert.equal(ctYmd('not a date'), '');
});

test('tzParts copies in lib/time.js and templates/_helpers.js are identical', () => {
  const extract = (file) => {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8');
    const m = src.match(/^(?:export )?function tzParts[\s\S]*?\n\}/m);
    assert.ok(m, `tzParts not found in ${file}`);
    return m[0].replace(/^export /, '');
  };
  assert.equal(
    extract('lib/time.js'),
    extract('templates/_helpers.js'),
    'tzParts drifted between lib/time.js and templates/_helpers.js — keep the bodies identical',
  );
});
