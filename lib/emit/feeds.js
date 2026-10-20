// Sitemap and robots. Paths come from the verb registry. The secret
// /frequency/ page is not listed.

import { esc } from '../safe-url.js';
import { sitemapPaths } from '../../site/verbs.ts';

/**
 * @param {object} opts
 * @param {string} opts.siteUrl canonical origin, no trailing slash
 * @returns {string}
 */
export function sitemapXml({ siteUrl }) {
  const origin = String(siteUrl || '').replace(/[\r\n]/g, '').replace(/\/$/, '');
  const urls = sitemapPaths()
    .map((route) => `  <url><loc>${esc(`${origin}${route}`)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * @param {string} siteUrl canonical origin, no trailing slash
 * @returns {string}
 */
export function robotsTxt(siteUrl) {
  const origin = String(siteUrl || '').replace(/[\r\n]/g, '').replace(/\/$/, '');
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;
}
