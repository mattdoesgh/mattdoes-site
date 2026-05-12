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
import { esc, fmtDate, ctWallClockToDate, safeUrl } from './templates/_helpers.js';

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
// source basename like "hero.jpg" → [{ path: "hero.webp", type: "image/webp" }]
// so mediaTag() can emit a <picture> element. Missing manifest → empty map,
// and mediaTag falls back to a bare <img>.
const mediaVariants = (() => {
  if (!fs.existsSync(MEDIA_MANIFEST)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(MEDIA_MANIFEST, 'utf8'));
    const m = new Map();
    for (const [key, entry] of Object.entries(data.entries || {})) {
      m.set(key, entry.variants || []);
      m.set(path.basename(key), entry.variants || []);
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

const files = walk(VAULT_DIR);
const notes = [];
for (const file of files) {
  const src  = fs.readFileSync(file, 'utf8');
  const { data, content } = matter(src);
  if (!data.publish || data.publish === 'draft') continue;
  const rel  = path.relative(VAULT_DIR, file);
  const base = path.basename(file, '.md');
  const slug = data.slug || kebab(data.title || base);
  notes.push({
    file, rel, base, body: content,
    frontmatter: data,
    publish: data.publish,
    title:   data.title || base,
    date:    data.date ? parseFrontmatterDate(data.date) : fs.statSync(file).mtime,
    updated: data.updated ? parseFrontmatterDate(data.updated) : null,
    slug,
    tags:    data.tags || [],
    summary: data.summary || '',
    aliases: data.aliases || [],
  });
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

/**
 * Render a vault attachment as the appropriate HTML element based on
 * extension: `<picture>` (with `.webp` source) for known image types,
 * `<audio>` for audio, `<video>` for video, or `<a>` as a fallback.
 *
 * @param {string} target attachment path (relative to `MEDIA_BASE`)
 * @param {string} [alt] alt text for images (defaults to filename)
 * @returns {string} HTML fragment
 */
function mediaTag(target, alt) {
  const clean = target.replace(/^\/+/, '');
  const url = mediaUrl(clean);
  if (IMG_EXT.test(clean)) {
    const variants = mediaVariants.get(clean) || mediaVariants.get(path.basename(clean)) || [];
    // An explicit `|caption` clause produces a <figcaption>. A bare embed
    // without a pipe falls back to the filename for the alt attr but
    // does not render a caption — captions are an opt-in affordance.
    const hasExplicitAlt = alt != null && alt !== '';
    const altText = esc(hasExplicitAlt ? alt : clean);
    const sources = variants
      .map(v => `<source type="${esc(v.type)}" srcset="${mediaUrl(v.path)}">`)
      .join('');
    const img = variants.length === 0
      ? `<img src="${url}" alt="${altText}" loading="lazy" />`
      : `<picture>${sources}<img src="${url}" alt="${altText}" loading="lazy" /></picture>`;
    return hasExplicitAlt
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
  // Embeds first: ![[file|alt]]
  md = md.replace(/!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target, alt) => mediaTag(target.trim(), alt && alt.trim()));
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

articles.sort((a, b) => b.date - a.date);
// Assign IDs in chronological order so t-001 is always the oldest thought
// and higher numbers are newer. Without this, IDs depend on vault-walk
// order (daily notes authored newest-first end up with t-001 = newest),
// which breaks stable permalinks and inverts the expected ordering on
// any page that renders newest-first. Flip back to desc for display.
thoughts.sort((a, b) => a.date - b.date);
thoughts.forEach((t, i) => { t.id = `t-${String(i + 1).padStart(3, '0')}`; });
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
    link:   t.link,
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
    link: l.link,
    date: l.date,
    url: l.link || '/listening/',
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

// Homepage — summary + thought highlights + recent listening.
// Recent slices are server-rendered at build; the live poller swaps the
// listening rows between deploys (capped at data-max=3 on the homepage).
// `topArtistRecent` and `scrobbles7d` are best-effort: they're computed
// from the `lastfm.limit` (default 25) most-recent tracks, so a heavy
// listening week may understate.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const last7 = listening.filter(t => t.date && (Date.now() - new Date(t.date).getTime()) < SEVEN_DAYS_MS);
const artistTally = new Map();
for (const t of last7) {
  if (!t.artist) continue;
  artistTally.set(t.artist, (artistTally.get(t.artist) || 0) + 1);
}
let topArtistRecent = null;
for (const [name, plays] of artistTally) {
  if (!topArtistRecent || plays > topArtistRecent.plays) topArtistRecent = { name, plays };
}
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexPage({
  site: siteMeta,
  recentThoughts: thoughts.slice(0, 3),
  recentTracks:   listening.slice(0, 3),
  topArtistRecent,
  scrobbles7d:    last7.length,
}));

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

// Blog — unified journal + making + thoughts listing. Replaces the three
// separate /journal/, /making/, /thoughts/ index pages (still reachable
// via 301s in static/_redirects). Individual post URLs are unchanged.
writePage('/blog/', blogPage({
  siteConfig,
  entries: feedEntries.filter(e => e.kind !== 'listening'),
  nowPlaying: nowPlayingStatus,
}));

// Listening keeps its own dedicated page since it's a distinct surface
// (live-polled tracklist, not a blog kind).
writePage('/listening/', listingPage({ siteConfig, kind: 'listening', entries: listening.slice(0, siteConfig.lastfm?.limit || 25), nowPlaying: nowPlayingStatus, totalScrobbles: scrobbleTotal }));

// About — singleton. Rendered from whichever vault note has
// `publish: about`. Logs and skips if missing; warns if duplicated.
if (aboutNotes.length > 1) {
  console.warn(`  (note: ${aboutNotes.length} notes have publish: about — using ${aboutNotes[0].rel})`);
}
if (aboutNotes.length) {
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
 * @returns {string} full XML feed (including `<?xml … ?>` prologue)
 */
function atomFeed() {
  const updated = feedEntries[0] ? rfc3339(feedEntries[0].date) : rfc3339(new Date());
  const items = feedEntries.slice(0, 30).map(e => {
    const title = e.title || (e.kind === 'thought' ? `thought · ${fmtDate(e.date, 'day')}` : e.kind);
    const content = e.html || esc(e.body || e.summary || '');
    const href = `${SITE_URL}${e.url}`;
    return `  <entry>
    <title>${esc(title)}</title>
    <link href="${esc(href)}"/>
    <id>${esc(href)}</id>
    <updated>${rfc3339(e.date)}</updated>
    <content type="html"><![CDATA[${cdataSafe(content)}]]></content>
  </entry>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>mattdoes.online</title>
  <link href="${SITE_URL}/"/>
  <link rel="self" href="${SITE_URL}/feed.xml"/>
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

// ── 9. Summary ──────────────────────────────────────────────────────────
console.log(`✓ built in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.log(`  ${notes.length} notes read → ${articles.length} articles, ${thoughts.length} thoughts`);
console.log(`  dist: ${distSizeKb}  ·  ${DIST_DIR}`);
