// build.js — mattdoes.online static site generator.
// Walks an Obsidian vault, resolves wikilinks + ![[embeds]], renders HTML.
//
// Usage:   npm run build
// Config:  VAULT_DIR env var overrides the default vault path.
//          MEDIA_BASE env var overrides where ![[image.jpg]] URLs point
//          (defaults to '/img'; set to 'https://media.mattdoes.online' for the R2 bucket).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

import { indexPage }    from './templates/index.js';
import { articlePage }  from './templates/journal.js';
import { thoughtsPage } from './templates/thoughts.js';
import { listingPage }  from './templates/listing.js';
import { colophonPage } from './templates/colophon.js';
import { sayHiPage }    from './templates/say-hi.js';
import { esc, fmtDate } from './templates/_helpers.js';
import { siteConfig }   from './site.config.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const VAULT_DIR  = process.env.VAULT_DIR || path.resolve(__dirname, 'vault');
const DIST_DIR   = path.resolve(__dirname, 'dist');
const STATIC_DIR = path.resolve(__dirname, 'static');
const MEDIA_BASE = (process.env.MEDIA_BASE || '/img').replace(/\/$/, '');
const SITE_URL   = process.env.SITE_URL || siteConfig.url || 'https://mattdoes.online';

const t0 = Date.now();

// ── 1. Walk vault & parse frontmatter ───────────────────────────────────
// We skip any *nested* Obsidian vault (a subdir with its own .obsidian/).
// Without this guard, a sub-vault that mirrors the top-level layout
// (e.g. MDO/daily/, MDO/notes/) gets walked in addition to daily/ and
// notes/ at the root, and every note is published twice.
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
    date:    data.date ? new Date(data.date) : fs.statSync(file).mtime,
    updated: data.updated ? new Date(data.updated) : null,
    slug,
    tags:    data.tags || [],
    summary: data.summary || '',
    aliases: data.aliases || [],
  });
}

// ── 2. Routes & slug index (for wikilink resolution) ────────────────────
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

function mediaTag(target, alt) {
  const url = `${MEDIA_BASE}/${encodeURIComponent(target)}`;
  if (IMG_EXT.test(target)) return `<img src="${url}" alt="${esc(alt || target)}" loading="lazy" />`;
  if (AUD_EXT.test(target)) return `<audio controls src="${url}" preload="none"></audio>`;
  if (VID_EXT.test(target)) return `<video controls src="${url}" preload="metadata"></video>`;
  return `<a href="${url}">${esc(target)}</a>`;
}

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

// Thoughts: daily file split on ## HH:MM headings → individual entries.
function splitThoughts(note) {
  const out = [];
  const lines = note.body.split('\n');
  let cur = null;
  const flush = () => { if (cur) { cur.body = cur.body.join('\n').trim(); out.push(cur); cur = null; } };
  for (const line of lines) {
    const m = line.match(/^##\s+(\d{1,2}):(\d{2})\b/);
    if (m) {
      flush();
      const hh = m[1].padStart(2, '0'), mm = m[2];
      const base = note.date instanceof Date ? note.date : new Date(note.date);
      const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(hh), Number(mm)));
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

// Total scrobble count from Last.fm's user.getinfo. Cached separately so
// the stat stays visible offline and across deploys without creds.
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

function renderBody(rawMd) {
  return marked.parse(resolveWikilinks(rawMd));
}

const articles = [];   // journal + making
const thoughts = [];   // individual micro-posts
let thoughtCounter = 0;

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
      thoughtCounter += 1;
      thoughts.push({
        ...t,
        id: `t-${String(thoughtCounter).padStart(3, '0')}`,
        html: renderBody(t.body),
      });
    }
  }
}

articles.sort((a, b) => b.date - a.date);
thoughts.sort((a, b) => b.date - a.date);

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
    body: t.body,
    html: t.html,
    date: t.date,
    url: `/thoughts/#${t.id}`,
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
function writePage(urlPath, html) {
  const dest = path.join(DIST_DIR, urlPath.replace(/^\//, ''), 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

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

// Copy vault attachments to dist/img (local dev; R2 sync is used in production)
const attachDir = path.join(VAULT_DIR, 'attachments');
if (fs.existsSync(attachDir)) {
  fs.mkdirSync(path.join(DIST_DIR, 'img'), { recursive: true });
  copyStatic(attachDir, path.join(DIST_DIR, 'img'));
}

// Homepage
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexPage({ site: siteMeta, entries: feedEntries }));

// Thoughts archive
writePage('/thoughts/', thoughtsPage({ site: siteMeta, thoughts }));

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

// Section index pages — /journal/, /making/, /listening/
writePage('/journal/',   listingPage({ siteConfig, kind: 'journal',   entries: journalArticles, nowPlaying: nowPlayingStatus }));
writePage('/making/',    listingPage({ siteConfig, kind: 'making',    entries: makingArticles,  nowPlaying: nowPlayingStatus }));
writePage('/listening/', listingPage({ siteConfig, kind: 'listening', entries: listening.slice(0, siteConfig.lastfm?.limit || 25), nowPlaying: nowPlayingStatus, totalScrobbles: scrobbleTotal }));

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

// Say hi
writePage('/say-hi/', sayHiPage({ site: siteMeta, nowPlaying: nowPlayingStatus }));

// ── 7. Feeds ────────────────────────────────────────────────────────────
function rfc3339(d) { return new Date(d).toISOString(); }
function atomFeed() {
  const updated = feedEntries[0] ? rfc3339(feedEntries[0].date) : rfc3339(new Date());
  const items = feedEntries.slice(0, 30).map(e => {
    const title = e.title || (e.kind === 'thought' ? `thought · ${fmtDate(e.date, 'day')}` : e.kind);
    const content = e.html || esc(e.body || e.summary || '');
    return `  <entry>
    <title>${esc(title)}</title>
    <link href="${SITE_URL}${e.url}"/>
    <id>${SITE_URL}${e.url}</id>
    <updated>${rfc3339(e.date)}</updated>
    <content type="html"><![CDATA[${content}]]></content>
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
