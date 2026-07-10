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
 * @param {{ date: string, thoughts: object[] }[]} input.notebookDays
 * @param {object[]} input.topics ranked Topic paths
 */
export function projectEditorialHome({ articles = [], notebookDays = [], topics = [] } = {}) {
  const writing = [...articles].sort(byNewest);
  const featured = writing[0] || null;

  return {
    featured,
    recentWriting: writing.slice(1, 3),
    notebookDays: notebookDays.slice(0, 2).map(day => ({
      ...day,
      thoughts: day.thoughts.slice(0, 3),
    })),
    // A Topic path needs at least two entries to communicate development; a
    // one-entry tag remains discoverable on its own page but is not a theme.
    currentTopics: topics.filter(topic => topic.count >= 2).slice(0, 3),
  };
}
