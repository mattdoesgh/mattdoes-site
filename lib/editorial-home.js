// lib/editorial-home.js — the homepage projection.
//
// Long-form journal and making notes are not published (ADR 0016), so the
// front page does not select a lead post or a recent-writing list. The
// shape stays stable for IndexPage and the design sketches.

/**
 * @param {object} [_input]
 * @returns {{ featured: null, recentWriting: [] }}
 */
export function projectEditorialHome(_input = {}) {
  return {
    featured: null,
    recentWriting: [],
  };
}
