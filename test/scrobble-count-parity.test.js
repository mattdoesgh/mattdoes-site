// The shared thousands formatter behind the films count.

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatScrobbleCount } from '../lib/format.js';

test('formatScrobbleCount groups thousands', () => {
  assert.equal(formatScrobbleCount(12345), '12,345');
  assert.ok(formatScrobbleCount(12345).includes(','), 'fixture playcount should exercise comma grouping');
});
