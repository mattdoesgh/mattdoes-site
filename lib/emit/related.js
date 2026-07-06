// lib/emit/related.js — tag-overlap "related posts" ranking for Emit.

/**
 * Rank the same-kind articles most related to `article` by tag overlap.
 * Pure: no clock, no fs. Ties break newest-first.
 *
 * @param {object}   article the article being rendered (url, kind, tags)
 * @param {object[]} pool    candidate articles of the same kind
 * @param {number}  [limit=5] max results
 * @returns {{ url: string, title: string, date: * }[]}
 */
export function relatedByTags(article, pool, limit = 5) {
  const tags = new Set(article.tags || []);
  if (!tags.size) return [];
  return pool
    .filter(a => a.url !== article.url && a.kind === article.kind)
    .map(a => ({
      url: a.url,
      title: a.title,
      date: a.date,
      overlap: (a.tags || []).filter(t => tags.has(t)).length,
    }))
    .filter(a => a.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || new Date(b.date) - new Date(a.date))
    .slice(0, limit)
    .map(({ url, title, date }) => ({ url, title, date }));
}
