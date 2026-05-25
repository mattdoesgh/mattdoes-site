// build.js — mattdoes.online static site generator.
// Walks an Obsidian vault, resolves wikilinks + ![[embeds]], renders HTML.
//
// Usage:   npm run build
// Config:  VAULT_DIR env var overrides the default vault path.
//          MEDIA_BASE env var overrides where ![[image.jpg]] URLs point
//          (defaults to '/img'; set to 'https://media.mattdoes.online' for the R2 bucket).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import markedFootnote from 'marked-footnote';
import { createHighlighter } from 'shiki';
import { transform as cssTransform } from 'lightningcss';
import { minify as jsMinify } from 'terser';

import { indexPage }    from './templates/index.js';
import { articlePage }  from './templates/journal.js';
import { listingPage }  from './templates/listing.js';
import { colophonPage } from './templates/colophon.js';
import { aboutPage }    from './templates/about.js';
import { blogPage }     from './templates/blog.js';
import { esc, fmtDate, fmtTime, ctWallClockToDate, safeUrl } from './templates/_helpers.js';

/**
 * Frontmatter dates without a time component (e.g. `date: 2026-04-19`)
 * are parsed by js-yaml as UTC midnight — which lands on the previous
 * calendar day in CT. Re-anchor them to CT midnight so posts don't
 * appear to be from the day before. Values with a time or offset are
 * left as-is: the author was explicit.
 *
 * @param {Date|string|null|undefined} v raw frontmatter value
 * @returns {Date|null} parsed UTC instant, or `null` for nullish input
 */
function parseFrontmatterDate(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    // YAML delivers strings only for values it couldn't parse as a date
    // (rare), or for full ISO timestamps inside quotes. A bare "YYYY-MM-DD"
    // string gets reinterpreted as CT midnight; anything richer goes
    // through the Date constructor untouched.
    const bare = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (bare) return ctWallClockToDate(+bare[1], +bare[2], +bare[3], 0, 0);
    return new Date(v);
  }
  if (v instanceof Date) {
    // js-yaml emits Dates at UTC midnight for bare YYYY-MM-DD values.
    // Detect that exact shape and reinterpret as CT midnight.
    if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0 && v.getUTCMilliseconds() === 0) {
      return ctWallClockToDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), 0, 0);
    }
    return v;
  }
  return new Date(v);
}
import { setAssets }    from './templates/_assets.js';
import { siteConfig }   from './site.config.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const VAULT_DIR  = process.env.VAULT_DIR || path.resolve(__dirname, 'vault');
const DIST_DIR   = path.resolve(__dirname, 'dist');
const STATIC_DIR = path.resolve(__dirname, 'static');
const MEDIA_BASE = (process.env.MEDIA_BASE || '/img').replace(/\/$/, '');
const MEDIA_BUILD_DIR = path.resolve(__dirname, '.cache', 'media-build');
const MEDIA_MANIFEST  = path.resolve(__dirname, '.cache', 'media-manifest.json');
const SITE_URL   = process.env.SITE_URL || siteConfig.url || 'https://mattdoes.online';

// Media variants index (populated from optimize-media's manifest). Maps a
// source basename like "hero.jpg" → { variants: [{ path, type }], width, height }
// so mediaTag() can emit a <picture> element and intrinsic dimensions.
// Missing manifest → empty map, and mediaTag falls back to a bare <img>.
const mediaVariants = (() => {
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
})();

const t0 = Date.now();

// ── 1. Walk vault & parse frontmatter ───────────────────────────────────
/**
 * Recursively collect every `.md` file under `dir`. Skips any *nested*
 * Obsidian vault (a subdir with its own `.obsidian/`). Without this guard,
 * a sub-vault that mirrors the top-level layout (e.g. `MDO/daily/`,
 * `MDO/notes/`) gets walked in addition to `daily/` and `notes/` at the
 * root, and every note is published twice.
 *
 * @param {string} dir absolute directory to scan
 * @param {string[]} [out=[]] accumulator (recursion); callers omit this
 * @param {boolean} [isRoot=true] internal flag — never set by callers
 * @returns {string[]} absolute paths to `.md` files
 */
function walk(dir, out = [], isRoot = true) {
  if (!fs.existsSync(dir)) return out;
  if (!isRoot && fs.existsSync(path.join(dir, '.obsidian'))) {
    console.warn(`  (note: skipping nested vault at ${path.relative(VAULT_DIR, dir) || dir})`);
    return out;
  }
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out, false);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * Lowercase + kebab-case a string for use as a URL slug.
 *
 * @param {unknown} s
 * @returns {string} `a-z0-9-` only, with no leading/trailing dash
 */
function kebab(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// A valid explicit slug is exactly one lowercase URL segment: lowercase
// alphanumerics in hyphen-separated groups. This rejects slashes (route
// escape / extra path segments), `..` (directory traversal), quotes and
// other attribute-breaking characters, and leading/trailing/double hyphens.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// `publish:` values that select a render target. Anything else is an
// authoring mistake and must fail the build loudly; nullish/`draft` are
// handled before this set is consulted (those notes are simply skipped).
const PUBLISH_KINDS = new Set(['journal', 'making', 'thoughts', 'about', 'draft']);

const files = walk(VAULT_DIR);
const notes = [];
// Resolved public route → first source file that claimed it. Two notes
// resolving to the same route would have one silently overwrite the other
// in dist/ while indexes still link both — so a collision fails the build.
const routeOwners = new Map();
for (const file of files) {
  const src  = fs.readFileSync(file, 'utf8');
  const { data, content } = matter(src);
  const rel  = path.relative(VAULT_DIR, file);
  // Validate `publish` before the skip check: an unrecognized non-nullish
  // value (e.g. a typo'd `publsh: journal` landing under `publish:`) is an
  // authoring mistake that would otherwise silently drop the note.
  if (data.publish != null && !PUBLISH_KINDS.has(data.publish)) {
    throw new Error(`Invalid frontmatter: ${rel} has publish: "${data.publish}" — must be one of ${[...PUBLISH_KINDS].join('/')}.`);
  }
  if (!data.publish || data.publish === 'draft') continue;
  const base = path.basename(file, '.md');

  // Slug: an explicit `slug:` must be a single safe URL segment; the
  // kebab() fallback (from title or filename) must be non-empty.
  let slug;
  if (data.slug != null && data.slug !== '') {
    slug = String(data.slug);
    if (!SLUG_RE.test(slug)) {
      throw new Error(`Invalid frontmatter: ${rel} has slug: "${slug}" — must be one lowercase URL segment (a-z0-9, hyphen-separated, no slashes, dots, quotes, or leading/trailing/double hyphens).`);
    }
  } else {
    slug = kebab(data.title || base);
    if (!slug) {
      throw new Error(`Invalid frontmatter: ${rel} produced an empty slug from its title/filename — set an explicit slug:.`);
    }
  }

  // Shape checks: tags/aliases must be arrays if present; date/updated, if
  // present, must parse to a valid Date (an unparseable value yields a
  // Date whose getTime() is NaN — reject it rather than emitting Invalid Date).
  if (data.tags != null && !Array.isArray(data.tags)) {
    throw new Error(`Invalid frontmatter: ${rel} has a non-array tags: value.`);
  }
  if (data.aliases != null && !Array.isArray(data.aliases)) {
    throw new Error(`Invalid frontmatter: ${rel} has a non-array aliases: value.`);
  }
  let parsedDate = null, parsedUpdated = null;
  if (data.date != null) {
    parsedDate = parseFrontmatterDate(data.date);
    if (!(parsedDate instanceof Date) || isNaN(parsedDate)) {
      throw new Error(`Invalid frontmatter: ${rel} has an unparseable date: value.`);
    }
  }
  if (data.updated != null) {
    parsedUpdated = parseFrontmatterDate(data.updated);
    if (!(parsedUpdated instanceof Date) || isNaN(parsedUpdated)) {
      throw new Error(`Invalid frontmatter: ${rel} has an unparseable updated: value.`);
    }
  }

  const note = {
    file, rel, base, body: content,
    frontmatter: data,
    publish: data.publish,
    title:   data.title || base,
    date:    parsedDate || fs.statSync(file).mtime,
    updated: parsedUpdated,
    slug,
    tags:    data.tags || [],
    summary: data.summary || '',
    aliases: data.aliases || [],
  };

  // Duplicate-route detection. Thought (daily) notes all resolve to the
  // shared /thoughts/ archive route, so they're exempt — only routes that
  // own a distinct page can collide.
  if (note.publish !== 'thoughts') {
    const route = routeFor(note);
    const owner = routeOwners.get(route);
    if (owner) {
      throw new Error(`Duplicate route ${route}: claimed by both ${owner} and ${rel}.`);
    }
    routeOwners.set(route, rel);
  }

  notes.push(note);
}

// ── 2. Routes & slug index (for wikilink resolution) ────────────────────
/**
 * Map a note to its public URL based on its `publish:` frontmatter.
 *
 * @param {{ publish: string, slug: string }} note
 * @returns {string} path beginning and ending in `/`
 */
function routeFor(note) {
  if (note.publish === 'journal')   return `/journal/${note.slug}/`;
  if (note.publish === 'making')    return `/making/${note.slug}/`;
  if (note.publish === 'thoughts')  return `/thoughts/`; // daily file → archive anchor
  return `/${note.slug}/`;
}

const slugIndex = new Map();
for (const n of notes) {
  if (n.publish === 'thoughts') continue;
  const route = routeFor(n);
  slugIndex.set(n.base,  { url: route, title: n.title });
  slugIndex.set(n.slug,  { url: route, title: n.title });
  slugIndex.set(n.title.toLowerCase(), { url: route, title: n.title });
  for (const a of n.aliases) slugIndex.set(a, { url: route, title: n.title });
}

// ── 3. Processors: wikilinks, embeds, thoughts split ────────────────────
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const AUD_EXT = /\.(mp3|ogg|wav|m4a|flac)$/i;
const VID_EXT = /\.(mp4|webm|mov)$/i;

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

// Track which informative images have already been warned about for
// missing authored alt text, so a note re-embedding the same file (or a
// repeated build pass) only logs once per target.
const altWarned = new Set();

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
  const clean = target.replace(/^\/+/, '');
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
 * with real HTML. Unresolved targets render as a `<span class="broken">`
 * so they're visible to the author rather than silently disappearing.
 * Fenced/inline code spans are masked first so the regex never edits
 * a literal `[[foo]]` inside a code block.
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

/**
 * Split a daily-note body on `## HH:MM` headings into individual "thought"
 * entries. Each `HH:MM` heading is interpreted as CT wall-clock combined
 * with the note's date. An inline `tags:: a, b` line inside a section
 * appends additional tags to just that thought. A body that's a single
 * blockquote line is flagged as a quote (`{quote: true}`).
 *
 * @param {{ body: string, date: Date|string|number, tags?: string[] }} note
 * @returns {Array<{ date: Date, tags: string[], body: string, quote: boolean }>}
 */
function splitThoughts(note) {
  const out = [];
  const lines = note.body.split('\n');
  let cur = null;
  const flush = () => { if (cur) { cur.body = cur.body.join('\n').trim(); out.push(cur); cur = null; } };
  for (const line of lines) {
    const m = line.match(/^##\s+(\d{1,2}):(\d{2})\b/);
    if (m) {
      flush();
      // HH:MM headings are authored in Matt's local time (CT). Combine
      // with the daily-note date (interpreted as a CT wall-clock date)
      // to produce the correct absolute UTC instant.
      const base = note.date instanceof Date ? note.date : new Date(note.date);
      const dt = ctWallClockToDate(
        base.getUTCFullYear(),
        base.getUTCMonth() + 1,
        base.getUTCDate(),
        Number(m[1]),
        Number(m[2]),
      );
      cur = { date: dt, tags: [...(note.tags || [])], body: [], quote: false };
      continue;
    }
    // Inline `tags:: a, b` shorthand inside a thought section.
    const tagMatch = line.match(/^tags::\s*(.+)$/i);
    if (cur && tagMatch) {
      cur.tags.push(...tagMatch[1].split(',').map(s => s.trim()).filter(Boolean));
      continue;
    }
    if (cur) cur.body.push(line);
  }
  flush();
  // Quote detection: body is a single blockquote line.
  for (const t of out) {
    const trimmed = t.body.trim();
    if (/^>\s/.test(trimmed) && !/\n/.test(trimmed)) { t.quote = true; t.body = trimmed.replace(/^>\s*/, ''); }
  }
  return out;
}

// Listening: fetched from the Last.fm API at build time. Cached to disk so
// offline builds still succeed. A missing username or API key just yields
// an empty list — the page still renders with an empty-state.
const CACHE_DIR  = path.resolve(__dirname, '.cache');
const LASTFM_CACHE = path.join(CACHE_DIR, 'lastfm.json');
const LASTFM_USER_CACHE = path.join(CACHE_DIR, 'lastfm-user.json');

/**
 * Fetch the configured Last.fm user's recent tracks for the build-time
 * /listening/ snapshot. Cached to disk (`.cache/lastfm.json`) so offline
 * builds still succeed; a stale cache is returned (with a warning) when
 * the upstream call fails. Missing creds → empty array.
 *
 * @returns {Promise<Array<{
 *   track: string, artist: string, album: string, link: string,
 *   image: string, date: string, nowPlaying: boolean,
 * }>>}
 */
async function fetchLastfmTracks() {
  const cfg = siteConfig.lastfm || {};
  const user = cfg.username || process.env.LASTFM_USERNAME || '';
  const key  = process.env.LASTFM_API_KEY || '';
  const ttl  = (cfg.cacheTtl ?? 900) * 1000;
  const limit = cfg.limit || 50;

  // Serve from cache if it's fresh enough.
  if (fs.existsSync(LASTFM_CACHE)) {
    try {
      const stat = fs.statSync(LASTFM_CACHE);
      if (Date.now() - stat.mtimeMs < ttl) {
        const cached = JSON.parse(fs.readFileSync(LASTFM_CACHE, 'utf8'));
        if (Array.isArray(cached.tracks)) return cached.tracks;
      }
    } catch {}
  }

  if (!user || !key) {
    // No credentials: fall back to whatever (stale) cache we have, else empty.
    if (fs.existsSync(LASTFM_CACHE)) {
      try { return JSON.parse(fs.readFileSync(LASTFM_CACHE, 'utf8')).tracks || []; } catch {}
    }
    return [];
  }

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw  = data?.recenttracks?.track || [];
    const tracks = (Array.isArray(raw) ? raw : [raw]).map(t => ({
      track:  t.name || '',
      artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
      album:  (t.album && t.album['#text']) || '',
      link:   t.url || '',
      image:  Array.isArray(t.image) ? (t.image[t.image.length - 1]?.['#text'] || '') : '',
      // `@attr.nowplaying` means no `date.uts`; use now instead.
      date:   t['@attr']?.nowplaying
        ? new Date().toISOString()
        : (t.date?.uts ? new Date(Number(t.date.uts) * 1000).toISOString() : ''),
      nowPlaying: Boolean(t['@attr']?.nowplaying),
    })).filter(t => t.artist && t.track);

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(LASTFM_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), tracks }, null, 2));
    return tracks;
  } catch (err) {
    console.warn(`  (note: Last.fm fetch failed — ${err.message}; using cache if available)`);
    if (fs.existsSync(LASTFM_CACHE)) {
      try { return JSON.parse(fs.readFileSync(LASTFM_CACHE, 'utf8')).tracks || []; } catch {}
    }
    return [];
  }
}

/**
 * Total scrobble count from Last.fm's `user.getinfo`. Cached separately
 * from the recent-tracks list (`.cache/lastfm-user.json`) so the stat
 * stays visible offline and across deploys without creds. Falls back to
 * the last good cached value, or `0`, when the upstream call fails.
 *
 * @returns {Promise<number>}
 */
async function fetchLastfmPlaycount() {
  const cfg  = siteConfig.lastfm || {};
  const user = cfg.username || process.env.LASTFM_USERNAME || '';
  const key  = process.env.LASTFM_API_KEY || '';
  const ttl  = (cfg.cacheTtl ?? 900) * 1000;

  const readCached = () => {
    if (!fs.existsSync(LASTFM_USER_CACHE)) return null;
    try {
      const cached = JSON.parse(fs.readFileSync(LASTFM_USER_CACHE, 'utf8'));
      return typeof cached.playcount === 'number' ? cached.playcount : null;
    } catch { return null; }
  };

  if (fs.existsSync(LASTFM_USER_CACHE)) {
    try {
      const stat = fs.statSync(LASTFM_USER_CACHE);
      if (Date.now() - stat.mtimeMs < ttl) {
        const hit = readCached();
        if (hit !== null) return hit;
      }
    } catch {}
  }

  if (!user || !key) return readCached() ?? 0;

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const playcount = Number(data?.user?.playcount) || 0;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(LASTFM_USER_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), playcount }, null, 2));
    return playcount;
  } catch (err) {
    console.warn(`  (note: Last.fm user.getinfo failed — ${err.message}; using cache if available)`);
    return readCached() ?? 0;
  }
}

// ── 4. Render markdown, produce entries ─────────────────────────────────
marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });

// Shiki highlighter — initialized once at build time and reused per fence.
// `defaultColor: false` emits Shiki's two-theme output as CSS custom
// properties (`--shiki-light`, `--shiki-dark`) so we can switch by the
// site's existing `html[data-theme]` attribute without re-running the
// build. Adding a new language only requires extending `LANGS`.
const LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'bash', 'shell',
  'css', 'html', 'json', 'markdown',
  'python', 'rust', 'go', 'yaml', 'toml', 'sql', 'diff',
];
const LANG_ALIAS = { js: 'javascript', ts: 'typescript', sh: 'bash', md: 'markdown', py: 'python', rs: 'rust', yml: 'yaml' };
const highlighter = await createHighlighter({
  themes: ['min-light', 'min-dark'],
  langs: LANGS,
});
const LOADED = new Set(highlighter.getLoadedLanguages());
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

const articles = [];   // journal + making
const thoughts = [];   // individual micro-posts
const aboutNotes = []; // publish: about — singleton, but collected as a list
                       // so a stray duplicate fails loud during render rather
                       // than silently shadowing the canonical /about/.

for (const n of notes) {
  if (n.publish === 'journal' || n.publish === 'making') {
    articles.push({
      ...n,
      kind: n.publish,
      url: routeFor(n),
      html: renderBody(n.body),
      sourcePath: `vault/${n.rel}`,
      sourceFile: path.basename(n.rel),
      words: n.body.split(/\s+/).length,
      readTime: `${Math.max(1, Math.round(n.body.split(/\s+/).length / 220))} min read`,
    });
  } else if (n.publish === 'thoughts') {
    for (const t of splitThoughts(n)) {
      thoughts.push({
        ...t,
        html: renderBody(t.body),
      });
    }
  } else if (n.publish === 'about') {
    aboutNotes.push({
      ...n,
      url: '/about/',
      html: renderBody(n.body),
    });
  }
}

// /about/ is a singleton surface. More than one `publish: about` note can't
// both own it — the second would silently overwrite the first in dist/
// while still being linked. Fail the build naming every offender.
if (aboutNotes.length > 1) {
  throw new Error(`Multiple publish: about notes — only one is allowed: ${aboutNotes.map(n => n.rel).join(', ')}.`);
}

articles.sort((a, b) => b.date - a.date);
// Stable thought IDs (F13 / contract C6). The old scheme assigned
// `t-001…` sequential ordinals after a chronological sort, so inserting an
// older daily note shifted every later ordinal and broke existing fragment
// permalinks and feed <id>s. Derive the id from the thought's own
// timestamp instead: `t-YYYYMMDD-HHMM` in CT wall-clock (the same zone the
// rest of the file treats dates in). `t.date` is the correct absolute
// instant — fmtDate('iso')/fmtTime convert it to CT components for us.
// Two thoughts in the same CT minute disambiguate with a `-2`, `-3`, … suffix.
thoughts.sort((a, b) => a.date - b.date);
{
  const idCounts = new Map();
  for (const t of thoughts) {
    const ymd = fmtDate(t.date, 'iso').replace(/-/g, ''); // YYYYMMDD in CT
    const hm  = fmtTime(t.date).replace(':', '');         // HHMM in CT
    const base = `t-${ymd}-${hm}`;
    const seen = idCounts.get(base) || 0;
    idCounts.set(base, seen + 1);
    t.id = seen === 0 ? base : `${base}-${seen + 1}`;
  }
}
thoughts.reverse();

// Listening: pulled from Last.fm. Kept separate from vault content.
const lastfmTracks  = await fetchLastfmTracks();
const scrobbleTotal = await fetchLastfmPlaycount();
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

// ── 5. Homepage entry aggregation ───────────────────────────────────────
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

// ── 6. Write dist/ ──────────────────────────────────────────────────────
/**
 * Write `html` to `dist/<urlPath>/index.html`, creating any missing
 * intermediate directories. The route prefix is stripped of leading
 * slashes before joining.
 *
 * @param {string} urlPath e.g. `'/journal/foo/'`
 * @param {string} html
 * @returns {void}
 */
function writePage(urlPath, html) {
  const dest = path.join(DIST_DIR, urlPath.replace(/^\//, ''), 'index.html');
  // Defense in depth: even though slugs are validated at parse time, assert
  // the resolved output path never escapes DIST_DIR before writing — a bad
  // route reaching here must fail loudly, never overwrite a file elsewhere.
  if (!path.resolve(dest).startsWith(DIST_DIR + path.sep)) {
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
    const stat = fs.statSync(src);
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

// Clean dist (tolerant of mounted-FS quirks that may not allow unlink)
try { fs.rmSync(DIST_DIR, { recursive: true, force: true }); } catch (e) {
  console.warn(`  (note: couldn't fully clean dist — ${e.code || e.message}; overwriting in place)`);
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy static assets (css, fonts, js) to dist root
copyStatic(STATIC_DIR, DIST_DIR);

// ── Minify + content-hash CSS/JS so they can be cached immutably. ──────
// Runs against the copies already in dist/; leaves /fonts/ and /img/ alone.
// Populates the template asset registry so emitted URLs reference the hashed
// filenames (e.g. `_shared.3a7b9f12.css`) — replaces the old manual ?v=N bust.
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
 * Minify + content-hash one asset already present in `dist/`. The original
 * is deleted and the hashed sibling is written next to it. CSS is run
 * through lightningcss; JS through terser.
 *
 * @param {string} filename basename in `dist/` (e.g. `'_shared.css'`)
 * @param {'css'|'js'} kind which minifier to use
 * @returns {Promise<[string,string]|undefined>} `[original, hashed]` pair,
 *   or `undefined` if the source file is missing
 */
async function processAsset(filename, kind) {
  const src = path.join(DIST_DIR, filename);
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
  fs.writeFileSync(path.join(DIST_DIR, hashed), output);
  try { fs.unlinkSync(src); } catch {}
  return [filename, hashed];
}

const assetMap = {};
const pairs = await Promise.all([
  processAsset('_shared.css',       'css'),
  processAsset('tweaks.js',         'js'),
  processAsset('nav-prefetch.js',   'js'),
  processAsset('geo-background.js', 'js'),
  processAsset('now-playing.js',    'js'),
  processAsset('local-time.js',     'js'),
  processAsset('listening-live.js', 'js'),
  processAsset('tag-filter.js',     'js'),
]);
for (const p of pairs) if (p) assetMap[p[0]] = p[1];
setAssets(assetMap);

// Append per-deploy `Link: rel=preload` headers for the critical-path
// hashed assets to dist/_headers, so Cloudflare Pages converts them to
// HTTP 103 Early Hints. Targets the dist copy (already populated by the
// copyStatic above) — never the static/ source — so each build starts
// fresh and the rule doesn't compound across runs.
/**
 * Append per-deploy `Link: rel=preload` headers for the critical-path
 * hashed assets to `dist/_headers`, so Cloudflare Pages converts them
 * to HTTP 103 Early Hints. Targets the dist copy (already populated by
 * the `copyStatic` above) — never the `static/` source — so each build
 * starts fresh and the rule doesn't compound across runs.
 *
 * @param {Record<string, string>} map original → hashed filename
 * @returns {void}
 */
function emitEarlyHintLinks(map) {
  const css    = map['_shared.css'];
  const tweaks = map['tweaks.js'];
  const nav    = map['nav-prefetch.js'];
  const lines = [
    css    && `  Link: </${css}>; rel=preload; as=style`,
    tweaks && `  Link: </${tweaks}>; rel=preload; as=script`,
    nav    && `  Link: </${nav}>; rel=preload; as=script`,
  ].filter(Boolean).join('\n');
  if (!lines) return;

  const headersPath = path.join(DIST_DIR, '_headers');
  let txt = fs.readFileSync(headersPath, 'utf8');
  // Match each HTML-route rule block: the route key (/, /*/, /*.html)
  // followed by both Cache-Control and CDN-Cache-Control lines. Anchor
  // on CDN-Cache-Control so appended Link: lines stay grouped under the
  // edge directive that triggers Early Hints.
  const routeRule = /^(\/(?:\*\/|\*\.html)?\n {2}Cache-Control: [^\n]+\n {2}CDN-Cache-Control: [^\n]+)$/gm;
  txt = txt.replace(routeRule, (block) => `${block}\n${lines}`);
  fs.writeFileSync(headersPath, txt);
}
emitEarlyHintLinks(assetMap);

// Copy vault attachments + optimized variants to dist/img for the default
// MEDIA_BASE='/img'. In production MEDIA_BASE points at media.mattdoes.online
// and sync-media has already pushed the same files to R2, so these on-disk
// copies are only consulted when the build is served locally. Variants are
// merged in after originals so the .webp sits next to its source.
const attachDir = path.join(VAULT_DIR, 'attachments');
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
  writePage(a.url, articlePage({
    site: siteMeta,
    note: a,
    recent: a.kind === 'journal' ? recentJournal : sameKind.slice(0, 5),
    prev,
    next,
  }));
}

// Blog — unified journal + making + thoughts listing. Kept as the single
// combined view with client-side kind chips. Individual post URLs unchanged.
writePage('/blog/', blogPage({
  siteConfig,
  entries: feedEntries.filter(e => e.kind !== 'listening'),
  nowPlaying: nowPlayingStatus,
}));

// Real per-kind archive index pages (F12 / contract C5). Previously
// /journal/, /making/, /thoughts/ were 301s into /blog/?kind=… and the
// filtering was JS-only — so a scripts-disabled visitor saw the whole
// archive. These server-rendered pages make each section meaningful
// without JavaScript; /blog/ remains the unified, chip-filterable view.
writePage('/journal/', listingPage({
  siteConfig, kind: 'journal', entries: journalArticles, nowPlaying: nowPlayingStatus,
}));
writePage('/making/', listingPage({
  siteConfig, kind: 'making', entries: makingArticles, nowPlaying: nowPlayingStatus,
}));
// Thoughts: pass the thought objects themselves (they carry .html, .date,
// .tags, .id, .quote). `thoughts` is already newest-first after the reverse()
// above. The template agent extends listingPage to accept kind:'thoughts'.
writePage('/thoughts/', listingPage({
  siteConfig, kind: 'thoughts', entries: thoughts, nowPlaying: nowPlayingStatus,
}));

// Listening keeps its own dedicated page since it's a distinct surface
// (live-polled tracklist, not a blog kind).
writePage('/listening/', listingPage({ siteConfig, kind: 'listening', entries: listening.slice(0, siteConfig.lastfm?.limit || 25), nowPlaying: nowPlayingStatus, totalScrobbles: scrobbleTotal }));

// About — singleton. Rendered from whichever vault note has `publish: about`.
// A duplicate is already rejected at parse time (see the aboutNotes length
// check above), so here we only need the present/absent branch.
const aboutWritten = aboutNotes.length > 0;
if (aboutWritten) {
  writePage('/about/', aboutPage({ site: siteMeta, note: aboutNotes[0] }));
}

// Colophon (get build.js line count for the vanity stat)
const buildLines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').length;
const distSizeKb = (() => {
  let total = 0;
  const walkSize = d => fs.readdirSync(d).forEach(n => {
    const p = path.join(d, n); const s = fs.statSync(p);
    if (s.isDirectory()) walkSize(p); else total += s.size;
  });
  walkSize(DIST_DIR);
  return `${Math.round(total / 1024)} KB`;
})();

// ── 7. Feeds ────────────────────────────────────────────────────────────
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
 * Build the Atom feed body from the (already sorted) `feedEntries`
 * array. Atom `<link href>` must be a valid IRI and is wrapped in a
 * quoted attribute, so URLs are XML-escaped via `esc()` along with
 * title text.
 *
 * Fixes applied (F5):
 *  - Emits feed-level and per-entry `<author>` metadata.
 *  - Only prefixes `SITE_URL` onto *relative* entry URLs — a listening
 *    entry whose `e.url` is already an absolute Last.fm URL is no longer
 *    double-prefixed into a malformed link.
 *  - Listening entries get a stable, unique tag-URI `<id>` derived from the
 *    scrobble timestamp, so repeated plays of one track no longer collapse
 *    into a single feed entry; they also use a site-owned /listening/ link.
 *  - Transient now-playing entries are excluded entirely.
 *
 * @returns {string} full XML feed (including `<?xml … ?>` prologue)
 */
function atomFeed() {
  const authorName = siteConfig.identity?.name || 'mattdoes.online';
  // Reused for the feed-level author and every entry author. Both name and
  // uri are XML-escaped since they land inside element content / attributes.
  const authorBlock = (indent) =>
    `${indent}<author><name>${esc(authorName)}</name><uri>${esc(SITE_URL + '/')}</uri></author>`;
  // Exclude transient now-playing entries — they have no durable identity
  // and would churn the feed on every build.
  const feedItems = feedEntries.filter(e => !(e.kind === 'listening' && e.nowPlaying));
  const updated = feedItems[0] ? rfc3339(feedItems[0].date) : rfc3339(new Date());
  const items = feedItems.slice(0, 30).map(e => {
    const title = e.title || (e.kind === 'thought' ? `thought · ${fmtDate(e.date, 'day')}` : e.kind);
    const content = e.html || esc(e.body || e.summary || '');
    // Listening entries always link to the site-owned /listening/ page, so
    // the feed link stays valid even if the upstream Last.fm URL rots.
    // Other kinds keep their own URL: prefix SITE_URL only when relative,
    // never when it's already an absolute http(s) URL.
    const isAbs = /^https?:\/\//i.test(e.url || '');
    const href = e.kind === 'listening'
      ? `${SITE_URL}/listening/`
      : (isAbs ? e.url : `${SITE_URL}${e.url}`);
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
  <link href="${SITE_URL}/"/>
  <link rel="self" href="${SITE_URL}/feed.xml"/>
${authorBlock('  ')}
  <updated>${updated}</updated>
  <id>${SITE_URL}/</id>
${items}
</feed>
`;
}
fs.writeFileSync(path.join(DIST_DIR, 'feed.xml'), atomFeed());

// ── 8. Render colophon last (so stats are current) ──────────────────────
writePage('/colophon/', colophonPage({
  updated: new Date(),
  nowPlaying: nowPlayingStatus,
  stats: {
    notesRead: notes.length,
    pagesWritten: articles.length + thoughts.length > 0 ? articles.length + 3 : articles.length,
    buildTime: `${((Date.now() - t0) / 1000).toFixed(1)}s`,
    distSize: distSizeKb,
    buildLines,
  },
}));

// ── 8b. Sitemap + robots (F16 / contract C9) ────────────────────────────
// Emit a crawl map of every generated route. The per-page <meta
// description>/canonical/OG tags are the template agent's concern; this
// half just makes the route set discoverable.
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
  // now real pages (F12), so they belong in the sitemap.
  const staticRoutes = ['/', '/blog/', '/listening/', '/colophon/', '/journal/', '/making/', '/thoughts/'];
  if (aboutWritten) staticRoutes.push('/about/');

  const urls = [
    ...staticRoutes.map(r => urlEl(`${SITE_URL}${r}`)),
    // Each article carries a date — surface it as <lastmod> so crawlers
    // can prioritize fresh content.
    ...articles.map(a => urlEl(`${SITE_URL}${a.url}`, rfc3339(a.date))),
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

Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robots);
}

// ── 9. Summary ──────────────────────────────────────────────────────────
console.log(`✓ built in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.log(`  ${notes.length} notes read → ${articles.length} articles, ${thoughts.length} thoughts`);
console.log(`  dist: ${distSizeKb}  ·  ${DIST_DIR}`);
