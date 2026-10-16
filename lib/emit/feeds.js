// lib/emit/feeds.js — sitemap and robots for Emit.
//
// Listening stays off the sitemap's feed (there is no post feed). Scrobbles
// live on /listening/.

import { esc } from '../../templates/_helpers.js';
import { SECTIONS } from '../sections.js';

/**
 * Sitemap (F16 / contract C9) — a crawl map of every generated route. The
 * per-page <meta description>/canonical/OG tags are the templates' concern;
 * this half just makes the route set discoverable.
 *
 * @param {object}   opts
 * @param {string}   opts.siteUrl canonical origin, no trailing slash
 * @param {boolean}  opts.aboutWritten whether /about/ was generated
 * @returns {string} full XML sitemap (including `<?xml … ?>` prologue)
 */
export function sitemapXml({ siteUrl, aboutWritten }) {
  /**
   * One `<url>` element. `loc` is XML-escaped (it can contain `&` from a
   * query-free but still reserved-character slug); `lastmod`, when given,
   * is an ISO date.
   *
   * @param {string} loc absolute URL
   * @param {string} [lastmod] ISO timestamp
   * @returns {string}
   */
  const urlEl = (loc) => `  <url><loc>${esc(loc)}</loc></url>`;

  // Static routes that are always generated, plus /about/ only when an
  // about note was written. Section listings come from the Section descriptor.
  const staticRoutes = [
    '/', '/search/', '/colophon/',
    '/digs/', '/movies/', '/grok/',
    ...Object.values(SECTIONS).map(s => s.route),
  ];
  if (aboutWritten) staticRoutes.push('/about/');

  const urls = staticRoutes.map(r => urlEl(`${siteUrl}${r}`)).join('\n');

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
