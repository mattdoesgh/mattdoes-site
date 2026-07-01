// lib/emit/feeds.js — Atom feed, sitemap, robots for Emit.
//
// The crawlable/subscribable views of the Content model. Listening is
// deliberately not a feed kind (see the feedEntries aggregation in
// index.js): scrobbles are high-frequency, low-signal, and live solely on
// the /listening/ page.

import { esc, fmtDate } from '../../templates/_helpers.js';
import { siteConfig } from '../../site.config.js';

/** @param {Date|string|number} d @returns {string} RFC 3339 / ISO 8601 timestamp */
function rfc3339(d) { return new Date(d).toISOString(); }
/**
 * Make a string safe to embed inside a CDATA section. CDATA can't
 * contain a literal `]]>`. A note body that ever includes that sequence
 * (trivial inside an XML/HTML code fence) would otherwise terminate the
 * section early and let downstream characters become feed-level markup.
 * The standard escape: split the closing brackets across two CDATA
 * sections.
 *
 * @param {unknown} s
 * @returns {string}
 */
function cdataSafe(s) {
  return String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
}

/**
 * Build the Atom feed body from the (already sorted) feed entries. Atom
 * `<link href>` must be a valid IRI and is wrapped in a quoted attribute,
 * so URLs are XML-escaped via `esc()` along with title text.
 *
 * Fixes applied (F5):
 *  - Emits feed-level and per-entry `<author>` metadata.
 *  - Only prefixes `siteUrl` onto *relative* entry URLs — an entry whose
 *    `e.url` is already an absolute URL is no longer double-prefixed into a
 *    malformed link.
 *
 * Listening/scrobble data is not a feed kind (see the feedEntries
 * aggregation in index.js), so the feed carries only articles and thoughts.
 *
 * @param {object[]} feedEntries sorted newest-first
 * @param {string} siteUrl canonical origin, no trailing slash
 * @returns {string} full XML feed (including `<?xml … ?>` prologue)
 */
export function atomFeed(feedEntries, siteUrl) {
  siteUrl = String(siteUrl || '').replace(/[\r\n]/g, '');
  const authorName = siteConfig.identity?.name || 'mattdoes.online';
  // Reused for the feed-level author and every entry author. Both name and
  // uri are XML-escaped since they land inside element content / attributes.
  const authorBlock = (indent) =>
    `${indent}<author><name>${esc(authorName)}</name><uri>${esc(siteUrl + '/')}</uri></author>`;
  const updated = feedEntries[0] ? rfc3339(feedEntries[0].date) : rfc3339(new Date());
  const items = feedEntries.slice(0, 30).map(e => {
    const title = e.title || (e.kind === 'thought' ? `thought · ${fmtDate(e.date, 'day')}` : e.kind);
    const content = e.html || esc(e.body || e.summary || '');
    // Prefix siteUrl only when the entry URL is relative, never when it's
    // already an absolute http(s) URL. Articles/thoughts have unique URLs, so
    // the link doubles as the entry <id>.
    const isAbs = /^https?:\/\//i.test(e.url || '');
    const href = isAbs ? e.url : `${siteUrl}${e.url}`;
    const id = href;
    return `  <entry>
    <title>${esc(title)}</title>
    <link href="${esc(href)}"/>
    <id>${esc(id)}</id>
${authorBlock('    ')}
    <updated>${rfc3339(e.date)}</updated>
    <content type="html"><![CDATA[${cdataSafe(content)}]]></content>
  </entry>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>mattdoes.online</title>
  <link href="${esc(siteUrl)}/"/>
  <link rel="self" href="${esc(siteUrl)}/feed.xml"/>
${authorBlock('  ')}
  <updated>${updated}</updated>
  <id>${esc(siteUrl)}/</id>
${items}
</feed>
`;
}

/**
 * Sitemap (F16 / contract C9) — a crawl map of every generated route. The
 * per-page <meta description>/canonical/OG tags are the templates' concern;
 * this half just makes the route set discoverable.
 *
 * @param {object}   opts
 * @param {string}   opts.siteUrl canonical origin, no trailing slash
 * @param {object[]} opts.articles rendered articles (each carries url + date)
 * @param {boolean}  opts.aboutWritten whether /about/ was generated
 * @returns {string} full XML sitemap (including `<?xml … ?>` prologue)
 */
export function sitemapXml({ siteUrl, articles, aboutWritten }) {
  /**
   * One `<url>` element. `loc` is XML-escaped (it can contain `&` from a
   * query-free but still reserved-character slug); `lastmod`, when given,
   * is an ISO date.
   *
   * @param {string} loc absolute URL
   * @param {string} [lastmod] ISO timestamp
   * @returns {string}
   */
  const urlEl = (loc, lastmod) =>
    `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ''}</url>`;

  // Static routes that are always generated, plus /about/ only when an
  // about note was actually written. /journal/, /making/, /thoughts/ are
  // real pages (F12), so they belong in the sitemap.
  const staticRoutes = ['/', '/blog/', '/search/', '/listening/', '/colophon/', '/journal/', '/making/', '/thoughts/'];
  if (aboutWritten) staticRoutes.push('/about/');

  const urls = [
    ...staticRoutes.map(r => urlEl(`${siteUrl}${r}`)),
    // Each article carries a date — surface it as <lastmod> so crawlers
    // can prioritize fresh content.
    ...articles.map(a => urlEl(`${siteUrl}${a.url}`, rfc3339(a.date))),
  ].join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * robots.txt — allow all crawling except the Worker API surface, and
 * advertise the sitemap so crawlers discover it without guessing.
 *
 * @param {string} siteUrl canonical origin, no trailing slash
 * @returns {string}
 */
export function robotsTxt(siteUrl) {
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`;
}
