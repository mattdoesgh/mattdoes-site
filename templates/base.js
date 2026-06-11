// Shared HTML shell — head, topbar, footer, tweaks panel.
// Every page's body fragment gets wrapped in this.

import { esc } from './_helpers.js';
import { asset } from './_assets.js';
import { siteConfig } from '../site.config.js';

const NAV = [
  { id: 'home',      href: '/',           label: 'home' },
  { id: 'blog',      href: '/blog/',      label: 'blog' },
  { id: 'listening', href: '/listening/', label: 'listening' },
  { id: 'about',     href: '/about/',     label: 'about' },
];

const META = [
  { id: 'colophon', href: '/colophon/',                  label: 'colophon' },
  { id: 'say-hi',   href: 'mailto:matt@mattdoes.online', label: 'say hi' },
];

const FOOTER_DEFAULT = [
  { href: '/blog/',                     label: 'blog' },
  { href: '/colophon/',                 label: 'colophon' },
  { href: 'mailto:matt@mattdoes.online', label: 'say hi' },
  { href: '/feed.xml',                  label: 'rss' },
];

export function base({ page, body }) {
  const siteTitle = siteConfig.title || 'mattdoes.online';
  const title = page.title ? `${page.title} — ${siteTitle}` : siteTitle;
  const active = page.navActive || '';

  // Document metadata (finding C9). `page.description` is the page-specific
  // summary; `page.url` is the page's own route path. The canonical URL drops
  // any query string — filtered archive views (?tag=, ?kind=) are enhancements
  // over the base path, so they all canonicalize to the unfiltered route.
  const description  = page.description || siteConfig.identity?.bio || '';
  const canonicalUrl = siteConfig.url + (page.canonical || page.url || '/');
  const ogType       = page.ogType === 'article' ? 'article' : 'website';
  const isLive      = !page.status && !siteConfig.status;
  const statusText  = page.status || siteConfig.status || (isLive ? page.nowPlaying : '') || '';
  const showDot     = page.statusDot ?? (isLive && Boolean(page.nowPlaying));
  const hidden      = isLive && !page.nowPlaying;
  const status      = isLive
    ? `<span class="status" id="now-playing"${hidden ? ' hidden' : ''} data-state="${hidden ? 'idle' : 'playing'}">${showDot ? '<span class="dot"></span>' : ''}${esc(statusText)}</span>`
    : statusText
      ? `<span class="status">${showDot ? '<span class="dot"></span>' : ''}${esc(statusText)}</span>`
      : '';
  const footerNav = page.footerNav || FOOTER_DEFAULT;
  const homeBrand = siteTitle.includes('.')
    ? `${siteTitle.split('.')[0]}<span class="dim">.${siteTitle.split('.').slice(1).join('.')}</span>`
    : esc(siteTitle);
  const geoEndpoint = (siteConfig.geo && siteConfig.geo.endpoint) || '/api/geo/lookup';

  // Resolve hashed asset URLs once so we can both reference them in
  // <script> tags AND emit them as <link rel="modulepreload"/preload>
  // hints in <head>. Hinting in <head> means the browser starts
  // fetching the JS in parallel with the CSS — significant on first
  // visit; on subsequent navigations the prefetcher (nav-prefetch.js)
  // ensures the same hashed bundles are already in the disk cache.
  const cssHref         = `/${asset('_shared.css')}`;
  const tweaksJs        = `/${asset('tweaks.js')}`;
  const geoBgJs         = `/${asset('geo-background.js')}`;
  const nowPlayingJs    = `/${asset('now-playing.js')}`;
  const localTimeJs     = `/${asset('local-time.js')}`;
  const navPrefetchJs   = `/${asset('nav-prefetch.js')}`;

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
     immutable copies. Must precede any module script (docs/adr/0001). -->
<script type="importmap">{"imports":{"/rows.js":"/${asset('rows.js')}","/_helpers.js":"/${asset('_helpers.js')}"}}</script>
${page.headExtra || ''}
</head>
<body>

<a class="skip-link" href="#main">skip to content</a>

<div id="geo-bg" aria-hidden="true"></div>

<div class="topbar">
  <div class="inner">
    <a href="/" class="home">${homeBrand}</a>
    <nav aria-label="primary">
      ${NAV.map(n => `<a href="${n.href}"${active === n.id ? ' class="on" aria-current="page"' : ''}>${n.label}</a>`).join('\n      ')}
    </nav>
    <span class="spacer"></span>
    ${META.map(m => `<a href="${m.href}" class="meta-link${active === m.id ? ' on' : ''}"${active === m.id ? ' aria-current="page"' : ''}${m.href.startsWith('mailto:') ? ' data-prefetch="off"' : ''}>${m.label}</a>`).join('\n    ')}
    ${status}
  </div>
</div>

${body}

<footer class="site">
  <div>${page.footerText ?? siteConfig.footerText ?? ''}</div>
  <nav aria-label="footer">${footerNav.map(n => `<a href="${n.href}"${n.href.startsWith('mailto:') ? ' data-prefetch="off"' : ''}>${n.label}</a>`).join('')}<button type="button" class="footer-link" data-tweaks-toggle aria-controls="tweaks" aria-expanded="false">tweaks</button></nav>
</footer>

<dialog id="tweaks" aria-labelledby="tweaks-title">
  <header><span id="tweaks-title">tweaks</span><button type="button" class="close" aria-label="close tweaks">×</button></header>
  <div class="row-t">
    <span class="row-t-label">dark mode</span>
    <button type="button" class="tk-toggle" data-key="dark" aria-pressed="true" aria-label="dark mode"></button>
  </div>
  <div class="row-t">
    <fieldset class="tk-swatches" data-key="accent">
      <legend class="row-t-label">accent</legend>
      <label class="tk-sw" data-value="warm"><input type="radio" name="tk-accent" value="warm"><span class="tk-sw-dot"></span><span class="visually-hidden">warm terracotta</span></label>
      <label class="tk-sw" data-value="pink"><input type="radio" name="tk-accent" value="pink"><span class="tk-sw-dot"></span><span class="visually-hidden">hot pink</span></label>
      <label class="tk-sw" data-value="blue"><input type="radio" name="tk-accent" value="blue"><span class="tk-sw-dot"></span><span class="visually-hidden">cool blue</span></label>
      <label class="tk-sw" data-value="green"><input type="radio" name="tk-accent" value="green"><span class="tk-sw-dot"></span><span class="visually-hidden">fern green</span></label>
    </fieldset>
  </div>
  <div class="row-t">
    <span class="row-t-label">local map</span>
    <div class="tk-seg" data-key="geo" role="group" aria-label="local map source">
      <button type="button" data-value="home" aria-pressed="true"  aria-label="local map: home">home</button>
      <button type="button" data-value="mine" aria-pressed="false" aria-label="local map: mine">mine</button>
      <button type="button" data-value="off"  aria-pressed="false" aria-label="local map: off">off</button>
    </div>
  </div>
  <div class="row-t">
    <span class="row-t-label">map style</span>
    <div class="tk-seg" data-key="geoShape" role="group" aria-label="map style">
      <button type="button" data-value="points" aria-pressed="true"  aria-label="map style: points">points</button>
      <button type="button" data-value="solid"  aria-pressed="false" aria-label="map style: solid">solid</button>
    </div>
  </div>
  <div class="row-t help">
    <p class="note">picking <em>mine</em> uses your location once to look up your city outline. the outline is cached on this device for 7 days; your coordinates aren't saved and never leave the lookup. switch back to <em>home</em> to clear it.</p>
  </div>
</dialog>

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
