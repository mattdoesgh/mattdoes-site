// Shared HTML shell — head, topbar, footer, tweaks panel.
// Every page's body fragment gets wrapped in this.

import { esc } from './_helpers.js';
import { siteConfig } from '../site.config.js';

const NAV = [
  { id: 'all',       href: '/',           label: 'all' },
  { id: 'journal',   href: '/journal/',   label: 'journal' },
  { id: 'thoughts',  href: '/thoughts/',  label: 'thoughts' },
  { id: 'making',    href: '/making/',    label: 'making' },
  { id: 'listening', href: '/listening/', label: 'listening' },
];

const META = [
  { id: 'colophon', href: '/colophon/', label: 'colophon' },
  { id: 'say-hi',   href: '/say-hi/',   label: 'say hi' },
];

const FOOTER_DEFAULT = [
  { href: '/thoughts/', label: 'thoughts' },
  { href: '/journal/',  label: 'journal' },
  { href: '/colophon/', label: 'colophon' },
  { href: '/say-hi/',   label: 'say hi' },
  { href: '/feed.xml',  label: 'rss' },
];

export function base({ page, body }) {
  const siteTitle = siteConfig.title || 'mattdoes.online';
  const title = page.title ? `${page.title} — ${siteTitle}` : siteTitle;
  const active = page.navActive || '';
  // Status priority: page-level override → config fixed string → build-time
  // now-playing from Last.fm (passed in as page.nowPlaying). The #now-playing
  // span is always in the DOM so now-playing.js can swap it client-side;
  // it's rendered with `hidden` when no build-time status is set.
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<link rel="stylesheet" href="/_shared.css?v=7" />
${page.headExtra || ''}
</head>
<body>

<div class="topbar">
  <div class="inner">
    <a href="/" class="home">${homeBrand}</a>
    <nav aria-label="primary">
      ${NAV.map(n => `<a href="${n.href}"${active === n.id ? ' class="on"' : ''}>${n.label}</a>`).join('\n      ')}
    </nav>
    <span class="spacer"></span>
    ${META.map(m => `<a href="${m.href}" class="meta-link${active === m.id ? ' on' : ''}">${m.label}</a>`).join('\n    ')}
    ${status}
  </div>
</div>

${body}

<footer class="site">
  <div>${page.footerText ?? siteConfig.footerText ?? ''}</div>
  <nav aria-label="footer">${footerNav.map(n => `<a href="${n.href}">${n.label}</a>`).join('')}</nav>
</footer>

<div id="tweaks">
  <header>tweaks<button type="button" class="close" aria-label="close">×</button></header>
  <div class="row-t">
    <label>dark mode</label>
    <button type="button" class="tk-toggle" data-key="dark" aria-pressed="true" aria-label="toggle dark mode"></button>
  </div>
  <div class="row-t">
    <label>accent</label>
    <div class="tk-swatches" data-key="accent">
      <button type="button" class="tk-sw" data-value="warm"  style="background:oklch(0.65 0.09 65);"  aria-pressed="false" aria-label="warm terracotta"></button>
      <button type="button" class="tk-sw" data-value="pink"  style="background:#f77bc9;"               aria-pressed="true"  aria-label="hot pink"></button>
      <button type="button" class="tk-sw" data-value="blue"  style="background:oklch(0.65 0.12 240);" aria-pressed="false" aria-label="cool blue"></button>
      <button type="button" class="tk-sw" data-value="green" style="background:oklch(0.65 0.12 150);" aria-pressed="false" aria-label="fern green"></button>
    </div>
  </div>
  <div class="row-t">
    <label>serif headings</label>
    <button type="button" class="tk-toggle" data-key="serif" aria-pressed="true" aria-label="toggle serif"></button>
  </div>
</div>

<script src="/tweaks.js" defer></script>
<script src="/now-playing.js" defer></script>
${page.bodyScripts || ''}
</body>
</html>
`;
}
