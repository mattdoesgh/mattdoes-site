// Tied to TEST_IGNORE_REDUCED_MOTION_ON_TOUCH in concepts/ambient/motion.js.
// Flipping that flag back to false keeps this test passing and restores
// the hold on a coarse pointer and on a screen with no hover.

import test from 'node:test';
import assert from 'node:assert/strict';

import { TEST_IGNORE_REDUCED_MOTION_ON_TOUCH, holdMotion } from '../concepts/ambient/motion.js';

test('TEST_IGNORE_REDUCED_MOTION_ON_TOUCH skips the hold on touch only', () => {
  const fine = { coarse: false, hoverNone: false, fine: true };
  const coarse = { coarse: true, hoverNone: false, fine: false };
  const noHover = { coarse: false, hoverNone: true, fine: false };
  const still = { coarse: false, hoverNone: false, fine: false };
  const skipped = TEST_IGNORE_REDUCED_MOTION_ON_TOUCH ? false : true;

  assert.equal(typeof TEST_IGNORE_REDUCED_MOTION_ON_TOUCH, 'boolean');
  assert.equal(holdMotion(true, fine), true);
  assert.equal(holdMotion(true, { coarse: false, hoverNone: true, fine: true }), true);
  assert.equal(holdMotion(false, fine), false);
  assert.equal(holdMotion(false, coarse), false);
  assert.equal(holdMotion(true, coarse), skipped);
  assert.equal(holdMotion(true, noHover), skipped);
  assert.equal(holdMotion(true, still), true);
});
