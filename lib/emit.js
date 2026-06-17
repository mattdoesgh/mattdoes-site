// lib/emit.js — Emit: Content model → dist/.
//
// Owns everything downstream of the Content model: markdown rendering
// (Shiki, wikilinks, embeds against the model's slug index), templates,
// static-asset minify+hash, feeds, sitemap, robots. Deterministic given its
// inputs — the Listening snapshot is passed in by the entrypoint
// (lib/listening.js), never fetched here. (See CONTEXT.md: Emit, Listening.)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import sanitizeHtml from 'sanitize-html';
import { createHighlighter } from 'shiki';
import { transform as cssTransform } from 'lightningcss';
import { minify as jsMinify } from 'terser';

import { indexPage }    from '../templates/index.js';
import { articlePage }  from '../templates/journal.js';
import { listingPage }  from '../templates/listing.js';
import { colophonPage } from '../templates/colophon.js';
import { aboutPage }    from '../templates/about.js';
import { blogPage }     from '../templates/blog.js';
import { esc, fmtDate, safeUrl } from '../templates/_helpers.js';
import { setAssets }    from '../templates/_assets.js';
import { siteConfig }   from '../site.config.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(REPO_ROOT, 'static');
const MEDIA_BUILD_DIR = path.join(REPO_ROOT, '.cache', 'media-build');
const MEDIA_MANIFEST  = path.join(REPO_ROOT, '.cache', 'media-manifest.json');

// ── per-emit rendering state ─────────────────────────────────────────────
// These are implementation details behind the emit() interface: the
// wikilink/embed renderers below are plugged into a module-singleton
// `marked`, so the state they close over is module-level and (re)assigned
// at the top of each emit() call.
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
function loadMediaVariants() {
  if (!fs.existsSync(MEDIA_MANIFEST)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(MEDIA_MANIFEST, 'utf8'));
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
async function initHighlighter() {
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
  return highlighter.codeToHtml(code, {
    lang: supported ? resolved : 'text',
    themes: { light: 'min-light', dark: 'min-dark' },
    defaultColor: false,
  });
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
 * @param {string} rawMd source markdown straight from the vault
 * @returns {string} rendered HTML
 */
function renderBody(rawMd) {
  return marked.parse(resolveWikilinks(rawMd));
}

// ── file plumbing ────────────────────────────────────────────────────────
/**
 * Write `html` to `<distDir>/<urlPath>/index.html`, creating any missing
 * intermediate directories. The route prefix is stripped of leading
 * slashes before joining.
 *
 * @param {string} distDir resolved dist root
 * @param {string} urlPath e.g. `'/journal/foo/'`
 * @param {string} html
 * @returns {void}
 */
function writePage(distDir, urlPath, html) {
  const dest = path.join(distDir, urlPath.replace(/^\//, ''), 'index.html');
  // Defense in depth: even though slugs are validated at intake time, assert
  // the resolved output path never escapes distDir before writing — a bad
  // route reaching here must fail loudly, never overwrite a file elsewhere.
  if (!path.resolve(dest).startsWith(distDir + path.sep)) {
    throw new Error(`Refusing to write outside dist/: route "${urlPath}" resolved to ${path.resolve(dest)}.`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

/**
 * Recursively copy a directory tree, replacing existing files. Tolerant
 * of EPERM/unlink errors caused by mounted filesystems (e.g. project
 * directories on iCloud Drive) — those files are skipped silently.
 *
 * @param {string} from source directory
 * @param {string} to destination directory (created on demand)
 * @returns {void}
 */
function copyStatic(from, to) {
  if (!fs.existsSync(from)) return;
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    const stat = fs.lstatSync(src);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to copy symlinked asset: ${src}`);
    }
    if (stat.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copyStatic(src, dst); }
    else {
      // Tolerate mounted-FS quirks: if destination can't be unlinked, skip.
      try { if (fs.existsSync(dst)) fs.unlinkSync(dst); } catch (e) {}
      try { fs.copyFileSync(src, dst); } catch (e) {
        if (e.code !== 'EPERM') throw e;
      }
    }
  }
}

// ── asset minify + content hash ──────────────────────────────────────────
/**
 * 8-hex-char content hash (truncated SHA-256). Used to fingerprint CSS/JS
 * filenames for immutable caching — collisions at 32 bits are effectively
 * impossible for the ~10 assets this site ships.
 *
 * @param {Buffer|string} buf
 * @returns {string} 8-char hex string
 */
function hash8(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/**
 * Minify + content-hash one asset already present in `distDir`. The original
 * is deleted and the hashed sibling is written next to it. CSS is run
 * through lightningcss; JS through terser (`'mjs'` for ES modules, so
 * import/export syntax parses and top-level names can be mangled safely).
 *
 * @param {string} distDir resolved dist root
 * @param {string} filename basename in `distDir` (e.g. `'_shared.css'`)
 * @param {'css'|'js'|'mjs'} kind which minifier to use
 * @returns {Promise<[string,string]|undefined>} `[original, hashed]` pair,
 *   or `undefined` if the source file is missing
 */
async function processAsset(distDir, filename, kind) {
  const src = path.join(distDir, filename);
  if (!fs.existsSync(src)) return;
  const input = fs.readFileSync(src);
  let output;
  if (kind === 'css') {
    const { code } = cssTransform({
      filename,
      code: input,
      minify: true,
      sourceMap: false,
    });
    output = Buffer.from(code);
  } else {
    const result = await jsMinify(input.toString('utf8'), {
      module: kind === 'mjs',
      compress: true,
      mangle: true,
      format: { comments: false },
      sourceMap: false,
    });
    output = Buffer.from(result.code ?? input.toString('utf8'), 'utf8');
  }
  const ext  = path.extname(filename);
  const stem = path.basename(filename, ext);
  const hashed = `${stem}.${hash8(output)}${ext}`;
  fs.writeFileSync(path.join(distDir, hashed), output);
  try { fs.unlinkSync(src); } catch {}
  return [filename, hashed];
}

/**
 * Append per-deploy `Link: rel=preload` headers for the critical-path
 * hashed assets to `<distDir>/_headers`, so Cloudflare Pages converts them
 * to HTTP 103 Early Hints. Targets the dist copy (already populated by
 * the `copyStatic` in emit) — never the `static/` source — so each build
 * starts fresh and the rule doesn't compound across runs.
 *
 * @param {string} distDir resolved dist root
 * @param {Record<string, string>} map original → hashed filename
 * @returns {void}
 */
function emitEarlyHintLinks(distDir, map) {
  const css    = map['_shared.css'];
  const tweaks = map['tweaks.js'];
  const nav    = map['nav-prefetch.js'];
  const lines = [
    css    && `  Link: </${css}>; rel=preload; as=style`,
    tweaks && `  Link: </${tweaks}>; rel=preload; as=script`,
    nav    && `  Link: </${nav}>; rel=preload; as=script`,
  ].filter(Boolean).join('\n');
  if (!lines) return;

  const headersPath = path.join(distDir, '_headers');
  let txt = fs.readFileSync(headersPath, 'utf8');
  // Match each HTML-route rule block: the route key (/, /*/, /*.html)
  // followed by both Cache-Control and CDN-Cache-Control lines. Anchor
  // on CDN-Cache-Control so appended Link: lines stay grouped under the
  // edge directive that triggers Early Hints.
  const routeRule = /^(\/(?:\*\/|\*\.html)?\n {2}Cache-Control: [^\n]+\n {2}CDN-Cache-Control: [^\n]+)$/gm;
  txt = txt.replace(routeRule, (block) => `${block}\n${lines}`);
  fs.writeFileSync(headersPath, txt);
}

// ── feeds ────────────────────────────────────────────────────────────────
/** @param {Date|string|number} d @returns {string} RFC 3339 / ISO 8601 timestamp */
function rfc3339(d) { return new Date(d).toISOString(); }
/**
 * Make a string safe to embed inside a CDATA section. CDATA can't
 * contain a literal `]]>`. A note body that ever includes that sequence
 * (trivial inside an XML/HTML code fence) would otherwise terminate the
 * section early and let downstream characters become feed-level markup.
 * The standard escape: split the closing brackets across two CDATA
 * sections.
 *
 * @param {unknown} s
 * @returns {string}
 */
function cdataSafe(s) {
  return String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
}

/**
 * Build the Atom feed body from the (already sorted) feed entries. Atom
 * `<link href>` must be a valid IRI and is wrapped in a quoted attribute,
 * so URLs are XML-escaped via `esc()` along with title text.
 *
 * Fixes applied (F5):
 *  - Emits feed-level and per-entry `<author>` metadata.
 *  - Only prefixes `siteUrl` onto *relative* entry URLs — a listening
 *    entry whose `e.url` is already an absolute Last.fm URL is no longer
 *    double-prefixed into a malformed link.
 *  - Listening entries get a stable, unique tag-URI `<id>` derived from the
 *    scrobble timestamp, so repeated plays of one track no longer collapse
 *    into a single feed entry; they also use a site-owned /listening/ link.
 *  - Transient now-playing entries are excluded entirely.
 *
 * @param {object[]} feedEntries sorted newest-first
 * @param {string} siteUrl canonical origin, no trailing slash
 * @returns {string} full XML feed (including `<?xml … ?>` prologue)
 */
function atomFeed(feedEntries, siteUrl) {
  siteUrl = String(siteUrl || '').replace(/[\r\n]/g, '');
  const authorName = siteConfig.identity?.name || 'mattdoes.online';
  // Reused for the feed-level author and every entry author. Both name and
  // uri are XML-escaped since they land inside element content / attributes.
  const authorBlock = (indent) =>
    `${indent}<author><name>${esc(authorName)}</name><uri>${esc(siteUrl + '/')}</uri></author>`;
  // Exclude transient now-playing entries — they have no durable identity
  // and would churn the feed on every build.
  const feedItems = feedEntries.filter(e => !(e.kind === 'listening' && e.nowPlaying));
  const updated = feedItems[0] ? rfc3339(feedItems[0].date) : rfc3339(new Date());
  const items = feedItems.slice(0, 30).map(e => {
    const title = e.title || (e.kind === 'thought' ? `thought · ${fmtDate(e.date, 'day')}` : e.kind);
    const content = e.html || esc(e.body || e.summary || '');
    // Listening entries always link to the site-owned /listening/ page, so
    // the feed link stays valid even if the upstream Last.fm URL rots.
    // Other kinds keep their own URL: prefix siteUrl only when relative,
    // never when it's already an absolute http(s) URL.
    const isAbs = /^https?:\/\//i.test(e.url || '');
    const href = e.kind === 'listening'
      ? `${siteUrl}/listening/`
      : (isAbs ? e.url : `${siteUrl}${e.url}`);
    // Unique <id>. Articles/thoughts have unique URLs already; listening
    // entries reuse one /listening/ link, so derive a per-scrobble tag URI
    // from the play timestamp so distinct plays stay distinct in readers.
    const id = e.kind === 'listening'
      ? `tag:mattdoes.online,2026:listening:${new Date(e.date).getTime()}`
      : href;
    return `  <entry>
    <title>${esc(title)}</title>
    <link href="${esc(href)}"/>
    <id>${esc(id)}</id>
${authorBlock('    ')}
    <updated>${rfc3339(e.date)}</updated>
    <content type="html"><![CDATA[${cdataSafe(content)}]]></content>
  </entry>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>mattdoes.online</title>
  <link href="${esc(siteUrl)}/"/>
  <link rel="self" href="${esc(siteUrl)}/feed.xml"/>
${authorBlock('  ')}
  <updated>${updated}</updated>
  <id>${esc(siteUrl)}/</id>
${items}
</feed>
`;
}

// ── emit ─────────────────────────────────────────────────────────────────
/**
 * Write the Content model to `distDir`. Everything the site ships — pages,
 * hashed assets, feeds, sitemap — comes out of this one call. Deterministic
 * given its inputs; the only reads outside `distDir` are the static/ tree,
 * vault attachments, the optimize-media manifest, and the lib/ sources
 * (for the colophon line-count stat).
 *
 * @param {import('./intake.js').ContentModel} model
 * @param {object}   opts
 * @param {string}   opts.distDir       output root (created/cleaned)
 * @param {string}   opts.vaultDir      vault root (for attachments/)
 * @param {string}  [opts.mediaBase]    URL prefix for ![[embeds]] (default '/img')
 * @param {string}   opts.siteUrl       canonical origin, no trailing slash
 * @param {object[]} [opts.lastfmTracks]  Listening snapshot rows (see lib/listening.js)
 * @param {number}  [opts.scrobbleTotal]  Last.fm total playcount
 * @param {number}  [opts.startedAt]    build-start ms timestamp (colophon stat)
 * @returns {Promise<{ distSize: string }>}
 */
export async function emit(model, {
  distDir,
  vaultDir,
  mediaBase = '/img',
  siteUrl,
  lastfmTracks = [],
  scrobbleTotal = 0,
  startedAt = Date.now(),
}) {
  const DIST_DIR = path.resolve(distDir);
  MEDIA_BASE    = String(mediaBase).replace(/\/$/, '');
  siteUrl       = String(siteUrl || '').replace(/[\r\n]/g, '');
  slugIndex     = model.slugIndex;
  mediaVariants = loadMediaVariants();
  altWarned.clear();
  await initHighlighter();

  // ── render markdown → HTML ────────────────────────────────────────────
  const articles = model.articles.map(a => ({ ...a, html: renderBody(a.body) }));
  const thoughts = model.thoughts.map(t => ({ ...t, html: renderBody(t.body) }));
  const about    = model.about.map(n => ({ ...n, html: renderBody(n.body) }));

  // Listening: pulled from Last.fm by the entrypoint. Kept separate from
  // vault content.
  const listening = lastfmTracks
    .filter(t => t.date)
    .map(t => ({
      kind: 'listening',
      track:  t.track,
      artist: t.artist,
      album:  t.album,
      // Last.fm data (live API or stale on-disk cache) is untrusted input
      // (contract C1): a `track.url` carrying an unsafe scheme or
      // attribute-breaking text must never reach an href. Normalize through
      // safeUrl() here so every downstream `entry.link` is already scheme-safe;
      // templates additionally HTML-escape on emit.
      link:   safeUrl(t.link),
      image:  t.image,
      date:   new Date(t.date),
      nowPlaying: t.nowPlaying,
      url: '/listening/',
      tags: [],
    }))
    .sort((a, b) => b.date - a.date);

  // ── homepage entry aggregation ────────────────────────────────────────
  const nowPlayingTrack = listening.find(l => l.nowPlaying) || null;
  const nowPlayingStatus = nowPlayingTrack
    ? `now: ${[nowPlayingTrack.artist, nowPlayingTrack.track].filter(Boolean).join(' — ')}`
    : '';

  const siteMeta = {
    config: siteConfig,
    bio: siteConfig.identity?.bio || '',
    identity: siteConfig.identity || {},
    links: siteConfig.links || [],
    nowPlaying: nowPlayingStatus,   // empty string when nothing is playing
    counts: {
      journal:   articles.filter(a => a.kind === 'journal').length,
      making:    articles.filter(a => a.kind === 'making').length,
      thoughts:  thoughts.length,
      listening: listening.length,
      scrobbles: scrobbleTotal,
    },
  };

  const feedEntries = [
    ...articles.map(a => ({
      kind: a.kind,
      title: a.title,
      date: a.date,
      url: a.url,
      summary: a.summary,
      tags: a.tags,
      readTime: a.readTime,
    })),
    ...thoughts.map(t => ({
      kind: 'thought',
      id: t.id,
      body: t.body,
      html: t.html,
      date: t.date,
      url: `/blog/#${t.id}`,
      permalinkLabel: `#${t.id}`,
      tags: t.tags,
      quote: t.quote,
    })),
    ...listening.map(l => ({
      kind: 'listening',
      title: [l.artist, l.track].filter(Boolean).join(' — '),
      artist: l.artist,
      track: l.track,
      album: l.album,
      // `l.link` is already safeUrl()-normalized above. Route `url` to a
      // usable destination: a missing link is `''` and an unsafe-scheme link
      // is `'#'` — in either case fall back to the site-owned /listening/
      // page rather than emitting a dead/placeholder href (contract C1).
      link: l.link,
      date: l.date,
      url: (l.link && l.link !== '#') ? l.link : '/listening/',
      tags: l.tags,
      nowPlaying: l.nowPlaying,
    })),
  ].sort((a, b) => b.date - a.date);

  // ── write dist/ ───────────────────────────────────────────────────────
  // Clean dist (tolerant of mounted-FS quirks that may not allow unlink)
  try { fs.rmSync(DIST_DIR, { recursive: true, force: true }); } catch (e) {
    console.warn(`  (note: couldn't fully clean dist — ${e.code || e.message}; overwriting in place)`);
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Copy static assets (css, fonts, js) to dist root
  copyStatic(STATIC_DIR, DIST_DIR);

  // The Row module and its helpers are templates first (imported by Node at
  // render time) but also ship to the browser: copy them next to the static
  // assets so they get the same minify+hash treatment. listening-live.js
  // imports them by clean URL through the importmap in templates/base.js
  // (docs/adr/0001).
  const TEMPLATES_DIR = path.join(REPO_ROOT, 'templates');
  fs.copyFileSync(path.join(TEMPLATES_DIR, 'rows.js'),     path.join(DIST_DIR, 'rows.js'));
  fs.copyFileSync(path.join(TEMPLATES_DIR, '_helpers.js'), path.join(DIST_DIR, '_helpers.js'));

  // Minify + content-hash CSS/JS so they can be cached immutably. Runs
  // against the copies already in dist/; leaves /fonts/ and /img/ alone.
  // Populates the template asset registry so emitted URLs reference the
  // hashed filenames (e.g. `_shared.3a7b9f12.css`).
  const assetMap = {};
  const pairs = await Promise.all([
    processAsset(DIST_DIR, '_shared.css',       'css'),
    processAsset(DIST_DIR, 'tweaks.js',         'js'),
    processAsset(DIST_DIR, 'nav-prefetch.js',   'js'),
    processAsset(DIST_DIR, 'geo-background.js', 'js'),
    processAsset(DIST_DIR, 'now-playing.js',    'js'),
    processAsset(DIST_DIR, 'local-time.js',     'js'),
    processAsset(DIST_DIR, 'listening-live.js', 'mjs'),
    processAsset(DIST_DIR, 'tag-filter.js',     'js'),
    processAsset(DIST_DIR, 'rows.js',           'mjs'),
    processAsset(DIST_DIR, '_helpers.js',       'mjs'),
  ]);
  for (const p of pairs) if (p) assetMap[p[0]] = p[1];
  setAssets(assetMap);
  emitEarlyHintLinks(DIST_DIR, assetMap);

  // Copy vault attachments + optimized variants to dist/img for the default
  // mediaBase='/img'. In production mediaBase points at media.mattdoes.online
  // and sync-media has already pushed the same files to R2, so these on-disk
  // copies are only consulted when the build is served locally. Variants are
  // merged in after originals so the .webp sits next to its source.
  const attachDir = path.join(vaultDir, 'attachments');
  if (fs.existsSync(attachDir)) {
    fs.mkdirSync(path.join(DIST_DIR, 'img'), { recursive: true });
    copyStatic(attachDir, path.join(DIST_DIR, 'img'));
  }
  if (fs.existsSync(MEDIA_BUILD_DIR)) {
    fs.mkdirSync(path.join(DIST_DIR, 'img'), { recursive: true });
    copyStatic(MEDIA_BUILD_DIR, path.join(DIST_DIR, 'img'));
  }

  // Homepage
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexPage({ site: siteMeta, entries: feedEntries }));

  // Articles (journal + making)
  const journalArticles = articles.filter(a => a.kind === 'journal');
  const makingArticles  = articles.filter(a => a.kind === 'making');
  const recentJournal   = journalArticles.slice(0, 5);
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const sameKind = a.kind === 'journal' ? journalArticles : makingArticles;
    const idx = sameKind.indexOf(a);
    const prev = sameKind[idx + 1]; // older
    const next = sameKind[idx - 1]; // newer
    writePage(DIST_DIR, a.url, articlePage({
      site: siteMeta,
      note: a,
      recent: a.kind === 'journal' ? recentJournal : sameKind.slice(0, 5),
      prev,
      next,
    }));
  }

  // Blog — unified journal + making + thoughts listing. Kept as the single
  // combined view with client-side kind chips. Individual post URLs unchanged.
  writePage(DIST_DIR, '/blog/', blogPage({
    siteConfig,
    entries: feedEntries.filter(e => e.kind !== 'listening'),
    nowPlaying: nowPlayingStatus,
  }));

  // Real per-kind archive index pages (F12 / contract C5). These
  // server-rendered pages make each section meaningful without JavaScript;
  // /blog/ remains the unified, chip-filterable view.
  writePage(DIST_DIR, '/journal/', listingPage({
    siteConfig, kind: 'journal', entries: journalArticles, nowPlaying: nowPlayingStatus,
  }));
  writePage(DIST_DIR, '/making/', listingPage({
    siteConfig, kind: 'making', entries: makingArticles, nowPlaying: nowPlayingStatus,
  }));
  // Thoughts: pass the thought objects themselves (they carry .html, .date,
  // .tags, .id, .quote). `thoughts` is already newest-first from intake.
  writePage(DIST_DIR, '/thoughts/', listingPage({
    siteConfig, kind: 'thoughts', entries: thoughts, nowPlaying: nowPlayingStatus,
  }));

  // Listening keeps its own dedicated page since it's a distinct surface
  // (live-polled tracklist, not a blog kind).
  writePage(DIST_DIR, '/listening/', listingPage({ siteConfig, kind: 'listening', entries: listening.slice(0, siteConfig.lastfm?.limit || 25), nowPlaying: nowPlayingStatus, totalScrobbles: scrobbleTotal }));

  // About — singleton. Rendered from whichever vault note has `publish: about`.
  // A duplicate is already rejected at intake time, so here we only need the
  // present/absent branch.
  const aboutWritten = about.length > 0;
  if (aboutWritten) {
    writePage(DIST_DIR, '/about/', aboutPage({ site: siteMeta, note: about[0] }));
  }

  // Colophon stats: the vanity line count covers the whole pipeline now that
  // it spans build.js + lib/ — counting only the entrypoint would understate
  // it dishonestly.
  const codeFiles = [
    path.join(REPO_ROOT, 'build.js'),
    ...fs.readdirSync(__dirname).filter(n => n.endsWith('.js')).map(n => path.join(__dirname, n)),
  ];
  const buildLines = codeFiles.reduce(
    (sum, f) => sum + fs.readFileSync(f, 'utf8').split('\n').length, 0);
  const distSizeKb = (() => {
    let total = 0;
    const walkSize = d => fs.readdirSync(d).forEach(n => {
      const p = path.join(d, n); const s = fs.statSync(p);
      if (s.isDirectory()) walkSize(p); else total += s.size;
    });
    walkSize(DIST_DIR);
    return `${Math.round(total / 1024)} KB`;
  })();

  // Feeds
  fs.writeFileSync(path.join(DIST_DIR, 'feed.xml'), atomFeed(feedEntries, siteUrl));

  // Render colophon last (so stats are current)
  writePage(DIST_DIR, '/colophon/', colophonPage({
    updated: new Date(),
    nowPlaying: nowPlayingStatus,
    stats: {
      notesRead: model.notes.length,
      pagesWritten: articles.length + thoughts.length > 0 ? articles.length + 3 : articles.length,
      buildTime: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      distSize: distSizeKb,
      buildLines,
    },
  }));

  // Sitemap + robots (F16 / contract C9). Emit a crawl map of every
  // generated route. The per-page <meta description>/canonical/OG tags are
  // the templates' concern; this half just makes the route set discoverable.
  {
    /**
     * One `<url>` element. `loc` is XML-escaped (it can contain `&` from a
     * query-free but still reserved-character slug); `lastmod`, when given,
     * is an ISO date.
     *
     * @param {string} loc absolute URL
     * @param {string} [lastmod] ISO timestamp
     * @returns {string}
     */
    const urlEl = (loc, lastmod) =>
      `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ''}</url>`;

    // Static routes that are always generated, plus /about/ only when an
    // about note was actually written. /journal/, /making/, /thoughts/ are
    // real pages (F12), so they belong in the sitemap.
    const staticRoutes = ['/', '/blog/', '/listening/', '/colophon/', '/journal/', '/making/', '/thoughts/'];
    if (aboutWritten) staticRoutes.push('/about/');

    const urls = [
      ...staticRoutes.map(r => urlEl(`${siteUrl}${r}`)),
      // Each article carries a date — surface it as <lastmod> so crawlers
      // can prioritize fresh content.
      ...articles.map(a => urlEl(`${siteUrl}${a.url}`, rfc3339(a.date))),
    ].join('\n');

    const sitemap = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap);

    // robots.txt — allow all crawling except the Worker API surface, and
    // advertise the sitemap so crawlers discover it without guessing.
    const robots = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`;
    fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robots);
  }

  return { distSize: distSizeKb };
}
