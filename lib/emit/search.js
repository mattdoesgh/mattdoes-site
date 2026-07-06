// lib/emit/search.js — build-time search index for Emit.
//
// The client-side filter (static/search.js) fetches this as
// /search-index.json; the shape here is its contract.

import { fmtDate } from '../../templates/_helpers.js';

/**
 * Build the search index rows from the rendered articles and thoughts.
 * Pure: derives everything from its arguments.
 *
 * @param {object[]} articles rendered articles (title, url, summary, kind, tags)
 * @param {object[]} thoughts rendered thoughts (id, body, date, tags)
 * @returns {object[]} index rows ({ title, url, summary, kind, tags, text })
 */
export function buildSearchIndex(articles, thoughts) {
  return [
    ...articles.map(a => ({
      title: a.title,
      url: a.url,
      summary: a.summary || '',
      kind: a.kind,
      tags: a.tags || [],
      text: [a.title, a.summary, ...(a.tags || [])].filter(Boolean).join(' '),
    })),
    ...thoughts.map(t => ({
      title: `thought · ${fmtDate(t.date, 'day')}`,
      url: `/blog/#${t.id}`,
      summary: String(t.body || '').slice(0, 160),
      kind: 'thought',
      tags: t.tags || [],
      text: [t.body, ...(t.tags || [])].filter(Boolean).join(' '),
    })),
  ];
}
