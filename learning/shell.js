// Shared document for /learning/. Tokens and the Anton file are rewritten
// at publish so the Pages output does not point back at the repo tree.

import { siteConfig } from '../site.config.js';
import { esc } from '../lib/safe-url.js';
import { socials } from '../site/verbs.ts';
import { socialIcon } from '../site/social-icons.js';

/**
 * @param {string} [siteUrl]
 * @returns {string}
 */
export function learningOrigin(siteUrl = siteConfig.url) {
  return String(siteUrl || siteConfig.url || 'https://mattdoes.online').replace(/\/$/, '');
}

/**
 * @returns {string}
 */
export function learningSocialNav() {
  const links = socials.map((item) => (
    `<a href="${esc(item.href)}" rel="me noopener" aria-label="${esc(item.label)}">${socialIcon(item.label)}</a>`
  )).join('\n          ');
  return `<nav class="socials" aria-label="socials">
          ${links}
        </nav>`;
}

/**
 * @param {object} page
 * @param {string} page.title
 * @param {string} page.description
 * @param {string} page.path
 * @param {string} page.cssHref
 * @param {string} page.main
 * @param {string} [page.scriptHref]
 * @param {string} [page.siteUrl]
 * @returns {string}
 */
export function renderLearningDocument({
  title,
  description,
  path,
  cssHref,
  main,
  scriptHref = '',
  siteUrl,
}) {
  const origin = learningOrigin(siteUrl);
  const canonical = `${origin}${path}`;
  const script = scriptHref ? `\n    <script type="module" src="${esc(scriptHref)}"></script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(canonical)}">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:type" content="website">
    <link rel="stylesheet" href="${esc(cssHref)}">
  </head>
  <body data-polarity="flip">
    <a class="skip-link" href="#main">Skip to content</a>
    <main id="main">
      ${main}
    </main>
    <footer class="site-footer">
      ${learningSocialNav()}
    </footer>${script}
  </body>
</html>
`;
}
