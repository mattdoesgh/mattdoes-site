// The preview hub. One registry row becomes one "unshared does X" link.
// Contact links come from the same function the offline page uses.

import { esc } from '../lib/safe-url.js';
import { unsharedOutlinks } from '../site/render.js';
import { unsharedEntries, unsharedHref, unsharedPrefix } from './entries.js';

/**
 * @returns {string}
 */
export function renderHubDocument() {
  const rows = unsharedEntries.map((entry) => {
    const href = esc(unsharedHref(entry));
    const label = esc(entry.label);
    const prefix = esc(`${unsharedPrefix} `);
    return `<li class="verb-row"><a class="verb" href="${href}"><span class="verb-prefix"><span>${prefix}</span></span><span class="verb-label">${label}</span></a></li>`;
  }).join('\n          ');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>matt does unshared</title>
    <link rel="stylesheet" href="hub.css">
  </head>
  <body data-polarity="flip">
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      <h1 class="sign"><a href="/">matt does unshared</a></h1>
      <nav aria-label="unshared">
        <p class="verb-kicker" aria-hidden="true">${esc(unsharedPrefix)}</p>
        <ol class="verbs">
          ${rows}
        </ol>
      </nav>
      ${unsharedOutlinks()}
    </main>
  </body>
</html>
`;
}
