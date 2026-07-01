// Document shell — the React renderer's equivalent of templates/base.js.
//
// The DS `Layout` renders only the in-body shell (skip link, geo-bg mount,
// topbar, content, footer, tweaks dialog). The document `<head>` and the
// trailing enhancement `<script>`s are emitted here, around the rendered body,
// exactly as templates/base.js did — same metadata, same importmap (ADR 0001),
// same preloads, same deferred scripts — so the cutover is semantic-equivalent
// at the document level and the client contracts (importmap, enhancement
// scripts) are preserved verbatim.
//
// This module calls renderToStaticMarkup itself and returns a finished HTML
// string, so the build (lib/emit/, plain Node) never imports react-dom.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { escHtml as esc } from '../src/index';

/** Minimal site config the document head needs. */
export interface DocSiteConfig {
  title?: string;
  url?: string;
  geo?: { endpoint?: string };
  /** Site bio — the description fallback when a page sets none (matches base.js). */
  identity?: { bio?: string };
}

/** Resolve a logical asset name to its leading-slash, content-hashed URL. */
export function assetUrl(assets: Record<string, string>, name: string): string {
  return `/${assets[name] || name}`;
}

/**
 * The page importmap as the exact JSON string emitted inline in <head>
 * (ADR 0001). Shared with the build so lib/emit/csp.js can hash these same bytes
 * into the CSP `script-src`: the strict CSP has no `'unsafe-inline'` and no
 * importmap analogue of `'inline-speculation-rules'`, so an unhashed inline
 * importmap is dropped — and every module that imports through it then resolves
 * its clean URL to a 404 and dies. The bytes (and hash) move whenever a mapped
 * asset's hash moves, so the build computes the hash per build, never pinned.
 */
export function buildImportmap(assets: Record<string, string>): string {
  return JSON.stringify({
    imports: {
      '/rows.js': assetUrl(assets, 'rows.js'),
      '/_helpers.js': assetUrl(assets, '_helpers.js'),
    },
  });
}

/**
 * The speculation rules JSON emitted inline in <head> (ADR 0007): Chromium
 * prerenders/prefetches same-origin links on intent. Exported as the exact
 * inline-script string so the build can hash it into the CSP alongside the
 * importmap. A hash source in `script-src` disables keyword inline allowances —
 * `'inline-speculation-rules'` included — so once the importmap is hashed, the
 * speculation rules MUST be hashed too or the browser blocks them. Asset-
 * independent (constant per build), so the build hashes a fixed string.
 */
export function buildSpeculationRules(): string {
  const where = { and: [
    { href_matches: '/*' },
    { not: { href_matches: '/api/*' } },
    { not: { selector_matches: '[data-prefetch="off"]' } },
    { not: { selector_matches: '[rel~="external"]' } },
  ] };
  return JSON.stringify({
    prerender: [{ source: 'document', where, eagerness: 'moderate' }],
    prefetch:  [{ source: 'document', where, eagerness: 'moderate' }],
  });
}

/** Per-page document metadata — the head-level half of templates/base.js `page`. */
export interface DocPage {
  /** Page title; combined as `${title} — ${siteTitle}`. Empty → bare site title. */
  title?: string;
  /** Meta description / OG description. Falls back to the site bio upstream. */
  description?: string;
  /** The page's own route path, used for the canonical URL. */
  url?: string;
  /** Explicit canonical path override (drops query strings on filtered views). */
  canonical?: string;
  /** `'article'` for posts, otherwise `'website'`. */
  ogType?: 'article' | 'website';
  /** Absolute or site-relative OG image URL (e.g. `/og/journal/foo.png`). */
  ogImage?: string;
  /** Raw HTML injected at the end of `<head>` (rare per-page additions). */
  headExtra?: string;
  /** Raw HTML for page-specific scripts, appended after the shell scripts. */
  bodyScripts?: string;
}

export interface RenderDocumentOptions {
  page: DocPage;
  /** The page body — typically `<Layout>…</Layout>`. */
  children: ReactNode;
  siteConfig: DocSiteConfig;
  /** original→hashed asset filename map (from lib/emit/assets.js after minify+hash). */
  assets?: Record<string, string>;
}

/**
 * Render a full HTML document string for one page. Reproduces the
 * templates/base.js head + trailing-script structure around the React body.
 */
export function renderDocument({ page, children, siteConfig, assets = {} }: RenderDocumentOptions): string {
  const url = (name: string) => assetUrl(assets, name);

  const siteTitle = siteConfig.title || 'mattdoes.online';
  const title = page.title ? `${page.title} — ${siteTitle}` : siteTitle;
  // Description falls back to the site bio when a page sets none (matches base.js).
  const description = page.description || siteConfig.identity?.bio || '';
  const canonicalUrl = (siteConfig.url || '') + (page.canonical || page.url || '/');
  const ogType = page.ogType === 'article' ? 'article' : 'website';
  const geoEndpoint = siteConfig.geo?.endpoint || '/api/geo/lookup';

  // Resolve hashed asset URLs once — referenced both as <head> preload hints and
  // as the deferred <script> tags at the end of <body>.
  const cssHref = url('_shared.css');
  const themeBootJs = url('theme-boot.js');
  const tweaksJs = url('tweaks.js');
  const geoBgJs = url('geo-background.js');
  const nowPlayingJs = url('now-playing.js');
  const localTimeJs = url('local-time.js');
  const navPrefetchJs = url('nav-prefetch.js');

  const importmap = buildImportmap(assets);

  // Speculation Rules: Chromium prerenders/prefetches same-origin links on
  // intent. `moderate` (hover / short viewport dwell) widens coverage once
  // enhancement scripts defer work until prerender activation (ADR 0007).
  // Emitted as static head markup. The CSP nominally allows it via the
  // `'inline-speculation-rules'` source, but that keyword is disabled once the
  // importmap hash lands in script-src, so the build hashes this string too
  // (lib/emit/csp.js → injectInlineScriptCsp). nav-prefetch.js supplies the
  // rel=prefetch fallback for Safari/Firefox.
  const speculationRules = buildSpeculationRules();

  const ogImageUrl = page.ogImage
    ? (page.ogImage.startsWith('http') ? page.ogImage : (siteConfig.url || '') + page.ogImage)
    : (siteConfig.url || '') + '/og/default.png';
  const ogImageTags = `
<meta property="og:image" content="${esc(ogImageUrl)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${esc(ogImageUrl)}" />`;

  const body = renderToStaticMarkup(children);

  // Media-CDN warm-up (dns-prefetch + preconnect) only pays off when the page
  // actually embeds an asset from it; on text-only pages (home, indexes, most
  // prose) an unconditional preconnect opens an idle TCP+TLS connection the page
  // never uses. Tie the hints to real usage by scanning the rendered body for a
  // media-origin embed. In dev mediaBase is '/img', so embeds carry no origin
  // and these are correctly absent.
  const mediaOrigin = 'https://media.mattdoes.online';
  const mediaHints = body.includes(`${mediaOrigin}/`)
    ? `
<!-- DNS warm-up + preconnect for the media CDN — emitted only when this page
     embeds a media-CDN asset, so text-only pages don't open an idle connection. -->
<link rel="dns-prefetch" href="${mediaOrigin}" />
<link rel="preconnect"   href="${mediaOrigin}" crossorigin />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonicalUrl)}" />
<!-- Atom feed autodiscovery. -->
<link rel="alternate" type="application/atom+xml" title="mattdoes.online" href="/feed.xml" />
<!-- Social sharing metadata (Open Graph + Twitter). -->
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="${esc(ogType)}" />
<meta property="og:url" content="${esc(canonicalUrl)}" />
<meta property="og:site_name" content="${esc(siteTitle)}" />
${ogImageTags}
<meta name="geo-endpoint" content="${esc(geoEndpoint)}" />
<!-- View Transitions: cross-document fades on supported browsers. -->
<meta name="view-transition" content="same-origin" />${mediaHints}
<!-- Critical font preloads — also emitted as Link: headers in /static/_headers
     for HTTP 103 Early Hints, but kept here so direct file:// + non-CF hosts work. -->
<link rel="preload" href="/fonts/JetBrainsMono-Regular.woff2" as="font" type="font/woff2" crossorigin />
<!-- Shell scripts — hinted early, executed deferred. -->
<link rel="preload" href="${tweaksJs}"      as="script" />
<link rel="preload" href="${navPrefetchJs}" as="script" />
<!-- Pre-paint theme boot: applies the visitor's saved theme/accent before the
     stylesheet paints, so navigations don't flash the default. Synchronous on
     purpose — must run before first paint (preloaded via Early Hints). -->
<script src="${themeBootJs}"></script>
<link rel="stylesheet" href="${cssHref}" />
<!-- Importmap: lets module scripts import shared modules by their clean
     URLs (/rows.js, /_helpers.js) while the network fetches the hashed
     immutable copies. Must precede any module script. -->
<script type="importmap">${importmap}</script>
<!-- Prerender/prefetch same-origin links on intent (Chromium). -->
<script type="speculationrules">${speculationRules}</script>
${page.headExtra || ''}
</head>
<body>

${body}

<script src="${tweaksJs}" defer></script>
<script src="${navPrefetchJs}" defer></script>
<script src="${geoBgJs}" defer></script>
<script src="${nowPlayingJs}" defer></script>
<script src="${localTimeJs}" defer></script>
${page.bodyScripts || ''}
</body>
</html>
`;
}
