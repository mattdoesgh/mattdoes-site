// lib/editorial-home.js — the deep editorial projection for the homepage.
//
// Emit supplies rendered writing, notebook days, and Topic paths. This module
// owns the selection policy so the IndexPage interface describes a front page,
// not a bag of feed entries plus presentation rules.

function byNewest(a, b) {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

/**
 * Project the Content model's rendered writing into an editorial front page.
 * The limits are deliberately implementation details: callers receive one
 * stable shape and do not need to coordinate ranking or truncation rules.
 *
 * @param {object} input
 * @param {object[]} input.articles rendered journal + making articles
 */
export function projectEditorialHome({ articles = [] } = {}) {
  const writing = [...articles].sort(byNewest);
  const featured = writing[0] || null;

  return {
    featured,
    // The home page is an entry point, not a second archive: one lead and a
    // short chronological list leave the remaining routes to do their jobs.
    recentWriting: writing.slice(1, 5),
  };
}
