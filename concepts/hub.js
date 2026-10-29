// The Unshared hub. One registry row becomes one label link.
// Profile links from unsharedProfiles sit under the heading.

import { siteConfig } from '../site.config.js';
import { esc } from '../lib/safe-url.js';
import { unsharedProfiles } from '../site/verbs.ts';
import { unsharedEntries, unsharedHref } from './entries.js';

function profileLinks() {
  return unsharedProfiles.map((item) => {
    const href = esc(item.href);
    const label = esc(item.label);
    return `<a class="profile" href="${href}" rel="me noopener">${label}</a>`;
  }).join('\n        ');
}

/**
 * @param {string} [siteUrl]
 * @returns {string}
 */
export function renderHubDocument(siteUrl = siteConfig.url) {
  const origin = String(siteUrl || siteConfig.url || 'https://mattdoes.online').replace(/\/$/, '');
  const canonical = `${origin}/unshared/`;
  const rows = unsharedEntries.map((entry) => {
    const href = esc(unsharedHref(entry));
    const label = esc(entry.label);
    return `<li class="verb-row"><a class="verb" href="${href}"><span class="verb-label">${label}</span></a></li>`;
  }).join('\n          ');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>matt does unshared</title>
    <meta name="description" content="matt does unshared.">
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:title" content="matt does unshared">
    <meta property="og:description" content="matt does unshared.">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:type" content="website">
    <link rel="stylesheet" href="./hub.css">
  </head>
  <body data-polarity="flip">
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <div class="mast">
        <h1 class="sign"><a href="/">matt does unshared</a></h1>
        ${profileLinks()}
      </div>
      <nav aria-label="unshared">
        <ol class="verbs">
          ${rows}
        </ol>
      </nav>
    </main>
  </body>
</html>
`;
}
