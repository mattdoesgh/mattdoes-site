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
// string, so the build (lib/emit.js, plain Node) never imports react-dom.
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
  /** original→hashed asset filename map (from lib/emit.js after minify+hash). */
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
  const tweaksJs = url('tweaks.js');
  const geoBgJs = url('geo-background.js');
  const nowPlayingJs = url('now-playing.js');
  const localTimeJs = url('local-time.js');
  const navPrefetchJs = url('nav-prefetch.js');

  const importmap = JSON.stringify({
    imports: {
      '/rows.js': url('rows.js'),
      '/_helpers.js': url('_helpers.js'),
    },
  });

  const body = renderToStaticMarkup(children);

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
<meta name="twitter:card" content="summary" />
<meta name="geo-endpoint" content="${esc(geoEndpoint)}" />
<!-- View Transitions: cross-document fades on supported browsers. -->
<meta name="view-transition" content="same-origin" />
<!-- DNS warm-up for the media CDN; only matters when an article actually embeds. -->
<link rel="dns-prefetch" href="https://media.mattdoes.online" />
<link rel="preconnect"   href="https://media.mattdoes.online" crossorigin />
<!-- Critical font preloads — also emitted as Link: headers in /static/_headers
     for HTTP 103 Early Hints, but kept here so direct file:// + non-CF hosts work. -->
<link rel="preload" href="/fonts/JetBrainsMono-Regular.woff2" as="font" type="font/woff2" crossorigin />
<!-- Shell scripts — hinted early, executed deferred. -->
<link rel="preload" href="${tweaksJs}"      as="script" />
<link rel="preload" href="${navPrefetchJs}" as="script" />
<link rel="stylesheet" href="${cssHref}" />
<!-- Importmap: lets module scripts import shared modules by their clean
     URLs (/rows.js, /_helpers.js) while the network fetches the hashed
     immutable copies. Must precede any module script. -->
<script type="importmap">${importmap}</script>
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
