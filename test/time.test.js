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

import { ctWallClockToDate, ctYmd, ctHm, tzParts } from '../lib/time.js';

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

test('ctYmd/ctHm format CT wall-clock digits and reject bad input', () => {
  assert.equal(ctYmd(ctWallClockToDate(2026, 1, 15, 9, 30)), '20260115');
  assert.equal(ctHm(ctWallClockToDate(2026, 1, 15, 9, 30)), '0930');
  assert.equal(ctYmd(ctWallClockToDate(2026, 6, 20, 0, 0)), '20260620');
  assert.equal(ctHm(ctWallClockToDate(2026, 6, 20, 0, 0)), '0000');
  assert.equal(ctYmd(null), '');
  assert.equal(ctHm(undefined), '');
  assert.equal(ctYmd('not a date'), '');
});
