// lib/emit/render.js — markdown → HTML for Emit.
//
// Owns the body-rendering half of Emit: Obsidian wikilinks/embeds resolved
// against the Content model's slug index, media elements from the
// optimize-media manifest, authored-HTML sanitization, and the marked +
// Shiki renderer (callouts, footnotes, CSP-safe token classes). Stateful
// per emit: configureRender() must run before the first renderBody().

import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import sanitizeHtml from 'sanitize-html';
import { createHighlighter } from 'shiki';

import { esc, safeUrl } from '../../templates/_helpers.js';
import { classifyShikiHtml } from '../shiki-csp.js';

// ── per-emit rendering state ─────────────────────────────────────────────
// These are implementation details behind the emit() interface: the
// wikilink/embed renderers below are plugged into a module-singleton
// `marked`, so the state they close over is module-level and (re)assigned
// by configureRender() at the top of each emit() call.
let MEDIA_BASE = '/img';
let slugIndex  = new Map();
let mediaVariants = new Map();
// Track which informative images have already been warned about for
// missing authored alt text, so a note re-embedding the same file (or a
// repeated render pass) only logs once per target.
const altWarned = new Set();

/**
 * Media variants index, populated from optimize-media's manifest. Maps a
 * source basename like "hero.jpg" → { variants: [{ path, type }], width,
 * height } so mediaTag() can emit a <picture> element and intrinsic
 * dimensions. Missing manifest → empty map, and mediaTag falls back to a
 * bare <img>.
 *
 * @returns {Map<string, object>}
 */
function loadMediaVariants(manifestPath) {
  if (!fs.existsSync(manifestPath)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const m = new Map();
    for (const [key, entry] of Object.entries(data.entries || {})) {
      // Keep variants alongside the intrinsic width/height recorded by
      // optimize-media.js, so mediaTag() can set <img width/height> and
      // reserve layout space (cuts CLS). Both the full vault-relative key
      // and the bare basename are indexed for flexible lookup.
      const info = { variants: entry.variants || [], width: entry.width, height: entry.height };
      m.set(key, info);
      m.set(path.basename(key), info);
    }
    return m;
  } catch { return new Map(); }
}

/**
 * (Re)initialize the per-emit render state. emit() calls this once, before
 * rendering any note body, so consecutive emits (e.g. across tests) never
 * leak a previous run's slug index, media base, or alt-text warnings.
 *
 * @param {object} opts
 * @param {string} opts.mediaBase URL prefix for ![[embeds]]
 * @param {Map<string, object>} opts.slugIndex the Content model's slug index
 * @param {string} opts.mediaManifest path to the optimize-media manifest
 *   (already default-resolved by emit(); a missing file → no variants)
 * @returns {void}
 */
export function configureRender(opts) {
  MEDIA_BASE    = String(opts.mediaBase).replace(/\/$/, '');
  slugIndex     = opts.slugIndex;
  mediaVariants = loadMediaVariants(opts.mediaManifest);
  altWarned.clear();
}

// ── wikilinks, embeds ────────────────────────────────────────────────────
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const AUD_EXT = /\.(mp3|ogg|wav|m4a|flac)$/i;
const VID_EXT = /\.(mp4|webm|mov)$/i;

const RAW_HTML_POLICY = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img', 'figure', 'figcaption', 'picture', 'source',
    'audio', 'video', 'details', 'summary', 'mark', 'small',
  ],
  allowedAttributes: {
    a:      ['href', 'name', 'target', 'rel', 'title'],
    img:    ['src', 'alt', 'title', 'width', 'height', 'loading', 'fetchpriority'],
    source: ['src', 'srcset', 'type', 'media'],
    audio:  ['src', 'controls', 'preload'],
    video:  ['src', 'controls', 'preload', 'width', 'height'],
    '*':    ['class', 'id', 'title', 'role', 'aria-label', 'aria-hidden'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset', 'cite'],
  allowProtocolRelative: false,
};

function sanitizeAuthoredHtml(html) {
  return sanitizeHtml(String(html || ''), RAW_HTML_POLICY);
}

function cleanMediaTarget(target) {
  const clean = String(target || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const pathPart = clean.split(/[?#]/, 1)[0];
  let decoded = pathPart;
  try { decoded = decodeURIComponent(pathPart); } catch { /* keep raw */ }
  if (!clean || decoded.split('/').some(seg => seg === '..')) return null;
  return clean;
}

/**
 * Build a `MEDIA_BASE`-prefixed URL for a vault-relative attachment path.
 * Each path segment is `encodeURIComponent`'d but slashes are preserved,
 * so nested attachments (e.g. `attachments/2026/foo.jpg`) resolve
 * cleanly against `MEDIA_BASE`.
 *
 * @param {string} p attachment path relative to `MEDIA_BASE`
 * @returns {string} fully-qualified URL
 */
function mediaUrl(p) {
  return `${MEDIA_BASE}/${p.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Render a vault attachment as the appropriate HTML element based on
 * extension: `<picture>` (with `.webp` source) for known image types,
 * `<audio>` for audio, `<video>` for video, or `<a>` as a fallback.
 *
 * Image embeds distinguish three alt-text cases (F15):
 *  - no pipe (`![[img.png]]`)        → `alt` is `undefined`; the filename is
 *    used as a last-resort alt and a one-time warning is logged.
 *  - empty pipe (`![[img.png|]]`)    → `alt` is `''`; the image is treated as
 *    decorative — `alt=""` and no `<figcaption>`.
 *  - text pipe (`![[img.png|cap]]`)  → `alt` is the caption; rendered with a
 *    `<figcaption>`.
 *
 * @param {string} target attachment path (relative to `MEDIA_BASE`)
 * @param {string|undefined} alt caption/alt text — `undefined` = no pipe,
 *   `''` = explicit decorative empty alt, non-empty = authored caption
 * @param {boolean} [eager=false] render the first image of a note eagerly
 *   (likely the LCP element) instead of `loading="lazy"`
 * @returns {string} HTML fragment
 */
function mediaTag(target, alt, eager = false) {
  const clean = cleanMediaTarget(target);
  if (!clean) return `<span class="broken">${esc(target)}</span>`;
  const url = mediaUrl(clean);
  if (IMG_EXT.test(clean)) {
    const info = mediaVariants.get(clean) || mediaVariants.get(path.basename(clean)) || {};
    const variants = info.variants || [];
    // Alt-text resolution. `undefined` = bare embed (no pipe); `''` = an
    // explicit decorative embed (`![[img|]]`); non-empty = authored caption.
    const isDecorative  = alt === '';
    const hasAuthoredAlt = alt != null && alt !== '';
    if (alt === undefined && !altWarned.has(clean)) {
      // Informative image without authored alt text — degrades to the
      // filename, which is rarely meaningful. Warn once so the author can
      // add `|caption` (informative) or `|` (decorative).
      altWarned.add(clean);
      console.warn(`  (note: image embed lacks alt text — ${clean}; add '|caption' or '|' for decorative)`);
    }
    const altText = isDecorative ? '' : esc(hasAuthoredAlt ? alt : clean);
    // Intrinsic dimensions, when optimize-media recorded them, let the
    // browser reserve layout space before decode (cuts CLS).
    const dims = (info.width && info.height)
      ? ` width="${info.width}" height="${info.height}"`
      : '';
    // Eager-load the first image in a note (likely above the fold / the LCP
    // element) and hint high fetch priority; lazy-load the rest.
    const loadAttrs = eager ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"';
    const sources = variants
      .map(v => `<source type="${esc(v.type)}" srcset="${mediaUrl(v.path)}">`)
      .join('');
    const imgTag = `<img src="${url}" alt="${altText}"${dims}${loadAttrs} />`;
    const img = variants.length === 0
      ? imgTag
      : `<picture>${sources}${imgTag}</picture>`;
    // A <figcaption> is only emitted for an authored caption — never for a
    // bare or explicitly-decorative embed.
    return hasAuthoredAlt
      ? `<figure>${img}<figcaption>${esc(alt)}</figcaption></figure>`
      : img;
  }
  if (AUD_EXT.test(clean)) return `<audio controls src="${url}" preload="none"></audio>`;
  if (VID_EXT.test(clean)) return `<video controls src="${url}" preload="metadata"></video>`;
  return `<a href="${url}">${esc(clean)}</a>`;
}

/**
 * Replace Obsidian-style `[[wikilinks]]` and `![[embeds]]` in markdown
 * with real HTML, resolved against the Content model's slug index.
 * Unresolved targets render as a `<span class="broken">` so they're
 * visible to the author rather than silently disappearing. Fenced/inline
 * code spans are masked first so the regex never edits a literal
 * `[[foo]]` inside a code block.
 *
 * @param {string} md raw markdown
 * @returns {string} markdown with wikilinks/embeds rewritten to HTML
 */
function resolveWikilinks(md) {
  // Mask fenced code blocks and inline code so wikilink regex doesn't mangle them.
  const masks = [];
  md = md.replace(/(```[\s\S]*?```|`[^`\n]*`)/g, (m) => {
    masks.push(m);
    return `\u0000${masks.length - 1}\u0000`;
  });
  // Embeds first: ![[file|alt]]. The alt group is `*` (not `+`) so an
  // explicit decorative embed `![[img.png|]]` matches with an empty alt;
  // mediaTag distinguishes that empty string from a missing pipe.
  // `imgIdx` counts image embeds in *this* note body so the first one
  // (likely the LCP / above-the-fold image) renders eagerly (F15).
  let imgIdx = 0;
  md = md.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (_, target, alt) => {
    const t = target.trim();
    const eager = IMG_EXT.test(t.replace(/^\/+/, '')) && imgIdx++ === 0;
    // Preserve the alt distinction: `undefined` (no pipe) stays undefined;
    // an empty/whitespace pipe collapses to `''` (decorative); otherwise trim.
    const altArg = alt === undefined ? undefined : alt.trim();
    return mediaTag(t, altArg, eager);
  });
  // Links: [[target|label]]
  md = md.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const key = target.trim().toLowerCase();
    const hit = slugIndex.get(target.trim()) || slugIndex.get(key);
    const txt = (label || target).trim();
    if (hit) return `<a href="${hit.url}">${esc(txt)}</a>`;
    return `<span class="broken" title="unresolved: ${esc(target)}">${esc(txt)}</span>`;
  });
  // Restore masked code.
  md = md.replace(/\u0000(\d+)\u0000/g, (_, i) => masks[Number(i)]);
  return md;
}

// ── markdown renderer (marked + Shiki) ──────────────────────────────────
marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });

// Shiki highlighter — initialized lazily on the first emit() and reused per
// fence, so importing this module (or running intake-only tests) never pays
// Shiki startup. `defaultColor: false` emits Shiki's two-theme output as CSS
// custom properties (`--shiki-light`, `--shiki-dark`) so we can switch by
// the site's existing `html[data-theme]` attribute without re-running the
// build. Adding a new language only requires extending `LANGS`.
const LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'bash', 'shell',
  'css', 'html', 'json', 'markdown',
  'python', 'rust', 'go', 'yaml', 'toml', 'sql', 'diff',
];
const LANG_ALIAS = { js: 'javascript', ts: 'typescript', sh: 'bash', md: 'markdown', py: 'python', rs: 'rust', yml: 'yaml' };
let highlighter = null;
let LOADED = new Set();
export async function initHighlighter() {
  if (highlighter) return;
  highlighter = await createHighlighter({
    themes: ['min-light', 'min-dark'],
    langs: LANGS,
  });
  LOADED = new Set(highlighter.getLoadedLanguages());
}
function highlightCode(code, rawLang) {
  const lang = (rawLang || '').toLowerCase().trim();
  const resolved = LANG_ALIAS[lang] || lang;
  const supported = resolved && LOADED.has(resolved);
  return classifyShikiHtml(highlighter.codeToHtml(code, {
    lang: supported ? resolved : 'text',
    themes: { light: 'min-light', dark: 'min-dark' },
    defaultColor: false,
  }));
}

// Callouts — Obsidian/GitHub-style: a blockquote whose first line is
// `[!type]` (optionally followed by a title) is rewritten to a semantic
// `<aside class="callout callout-${type}">`. We tag the token in
// walkTokens and then branch on it in the blockquote renderer.
const CALLOUT_RE = /^\[!(\w+)\]\s*(.*)$/;
function detectCallout(token) {
  if (token.type !== 'blockquote' || !token.tokens?.length) return;
  const first = token.tokens[0];
  if (first.type !== 'paragraph' || !first.tokens?.length) return;
  const t0 = first.tokens[0];
  if (t0.type !== 'text') return;
  const lines = t0.text.split('\n');
  const m = lines[0].match(CALLOUT_RE);
  if (!m) return;
  const rest = lines.slice(1).join('\n');
  t0.text = rest;
  t0.raw  = rest;
  // Drop the now-empty leading paragraph if there's no body left.
  if (!rest.trim()) first.tokens.shift();
  if (first.tokens.length === 0) token.tokens.shift();
  token.callout = { type: m[1].toLowerCase(), title: m[2].trim() };
}

// Scheme-allowlist any link or image URL emitted by marked. A note author
// who pastes `[click](javascript:…)` or `![](data:text/html,…)` otherwise
// gets those URLs rendered verbatim — CSP currently catches the fallout
// but this is cheap belt-and-braces at the source.
const renderers = {
  html(token) {
    const raw = typeof token === 'string' ? token : (token.raw || token.text || '');
    return sanitizeAuthoredHtml(raw);
  },
  link({ href, title, tokens }) {
    const safe = safeUrl(href);
    const t = title ? ` title="${esc(title)}"` : '';
    const text = this.parser.parseInline(tokens);
    return `<a href="${esc(safe)}"${t}>${text}</a>`;
  },
  image({ href, title, text }) {
    const safe = safeUrl(href);
    const t = title ? ` title="${esc(title)}"` : '';
    const alt = text != null ? ` alt="${esc(text)}"` : '';
    return `<img src="${esc(safe)}"${alt}${t} loading="lazy" />`;
  },
  code({ text, lang }) {
    return highlightCode(text, lang || '');
  },
  blockquote(token) {
    const inner = this.parser.parse(token.tokens);
    if (token.callout) {
      const { type, title } = token.callout;
      const titleHtml = title ? `<div class="callout-title">${esc(title)}</div>` : '';
      return `<aside class="callout callout-${esc(type)}" role="note">${titleHtml}<div class="callout-body">${inner}</div></aside>`;
    }
    return `<blockquote>${inner}</blockquote>`;
  },
};
marked.use({
  renderer: renderers,
  walkTokens: detectCallout,
});
marked.use(markedFootnote());

/**
 * Resolve wikilinks/embeds and run the result through `marked`.
 *
 * Callers must run configureRender() and `await initHighlighter()` first —
 * emit() does; a code fence rendered before init dereferences a null
 * highlighter.
 *
 * @param {string} rawMd source markdown straight from the vault
 * @returns {string} rendered HTML
 */
export function renderBody(rawMd) {
  return marked.parse(resolveWikilinks(rawMd));
}
