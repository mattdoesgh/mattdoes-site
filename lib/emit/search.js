// lib/emit/search.js — build-time search index for Emit.
//
// The client-side filter (static/search.js) fetches this as
// /search-index.json; the shape here is its contract.

/**
 * Build the search index rows from the rendered articles.
 * Pure: derives everything from its arguments. The retired notebook is
 * not indexed.
 *
 * @param {object[]} articles rendered articles (title, url, summary, kind, tags)
 * @returns {object[]} index rows ({ title, url, summary, kind, tags, text })
 */
export function buildSearchIndex(articles) {
  return articles.map(a => ({
    title: a.title,
    url: a.url,
    summary: a.summary || '',
    kind: a.kind,
    tags: a.tags || [],
    text: [a.title, a.summary, ...(a.tags || [])].filter(Boolean).join(' '),
  }));
}
