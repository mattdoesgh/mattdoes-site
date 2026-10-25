// TODO: remove before production. Temporary so a phone that asks for
// reduced motion can be tested with the full flock. Set this to false
// to honor reduced motion on touch again.
export const TEST_IGNORE_REDUCED_MOTION_ON_TOUCH = true;

/**
 * Whether this page should hold the flock still.
 * A coarse pointer, or a screen with no hover, skips that hold while
 * the test flag is on. A fine pointer keeps the hold.
 *
 * @param {boolean} prefersReduce
 * @param {{ coarse?: boolean, hoverNone?: boolean, fine?: boolean }} pointer
 * @returns {boolean}
 */
export function holdMotion(prefersReduce, pointer) {
  const fine = !!(pointer && pointer.fine);
  const touch = !fine && !!(pointer && (pointer.coarse || pointer.hoverNone));
  if (TEST_IGNORE_REDUCED_MOTION_ON_TOUCH && touch) return false;
  return !!prefersReduce;
}
