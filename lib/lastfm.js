// lib/lastfm.js — the Last.fm wire-format codec.
//
// Pure and isomorphic: URL builders and response decoders shared by the
// build-time snapshot (lib/listening.js) and the edge live-updater
// (workers/listening). No fetch, no fs, no config — each consumer keeps its
// own fetch/cache/error policy and stops hand-rolling the same query strings
// and field extraction.
//
// ⚠ Deploy coupling: the listening Worker bundles this file at
// deploy time. Editing it means redeploying the Workers — `npm run
// deploy:workers` from the repo root.

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

function safeTrackUrl(url) {
  if (url == null) return '';
  const s = String(url).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

/** `user.getrecenttracks` request URL. */
export function recentTracksUrl(user, key, limit) {
  return `${API_ROOT}?method=user.getrecenttracks&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&format=json&limit=${limit}`;
}

/**
 * Last.fm often returns HTTP 200 with `{ error, message }` instead of a
 * thrown transport error. Consumers must treat that as upstream failure —
 * decoding it as an empty payload would cache zero scrobbles as success.
 *
 * @param {object} body  parsed JSON response
 * @returns {boolean}
 */
export function lastfmError(body) {
  return Boolean(body && typeof body.error === 'number' && body.message);
}

/**
 * Decode one raw `user.getrecenttracks` track object into the normalized
 * shape both consumers render from. Key order is the listening Worker's —
 * its JSON payloads (and KV entries) are byte-visible, the build's disk
 * cache is not.
 *
 * @param {object} t  raw Last.fm track object
 * @param {object} [opts]
 * @param {boolean} [opts.image]  also extract the largest artwork URL
 *   (build-time snapshot wants it; the Worker payload doesn't ship it)
 * @param {Date|string|number} [opts.now]  instant used to stamp `date` on a
 *   now-playing track (Last.fm sends no `date.uts` for those). Defaults to
 *   the current time; tests inject a fixed instant for determinism.
 * @returns {{ artist: string, track: string, album: string, link: string,
 *   date: string, nowPlaying: boolean, image?: string }}
 */
export function decodeTrack(t, { image = false, now } = {}) {
  const nowPlaying = Boolean(t['@attr']?.nowplaying);
  const decoded = {
    artist: (t.artist && (t.artist['#text'] || t.artist.name)) || '',
    track:  t.name || '',
    album:  (t.album && t.album['#text']) || '',
    link:   safeTrackUrl(t.url),
    // `@attr.nowplaying` rows carry no date.uts; stamp with `now` so
    // consumers can still sort and render a year label.
    date: nowPlaying
      ? (now != null ? new Date(now) : new Date()).toISOString()
      : (t.date?.uts ? new Date(Number(t.date.uts) * 1000).toISOString() : ''),
    nowPlaying,
  };
  if (image) {
    decoded.image = Array.isArray(t.image) ? (t.image[t.image.length - 1]?.['#text'] || '') : '';
  }
  return decoded;
}

/**
 * Decode a full `user.getrecenttracks` response body. Handles Last.fm's
 * single-track-as-object quirk, drops tracks missing an artist or title,
 * and reads the total scrobble count from the response's `@attr.total` —
 * the single playcount source for both consumers (the live Worker payload
 * and the build-time snapshot), so the live and static stats can't disagree.
 *
 * @param {object} body  parsed JSON response
 * @param {object} [opts]
 * @param {number} [opts.limit]  cap the decoded track list (the API returns
 *   limit+1 entries when a track is now playing); omit to keep them all
 * @param {boolean} [opts.image]  forwarded to {@link decodeTrack}
 * @param {Date|string|number} [opts.now]  forwarded to {@link decodeTrack}
 * @returns {{ playcount: number, tracks: object[] }}
 */
export function decodeTracks(body, { limit, image = false, now } = {}) {
  const raw  = body?.recenttracks?.track || [];
  const attr = body?.recenttracks?.['@attr'] || {};
  const arr  = Array.isArray(raw) ? raw : [raw];
  let tracks = arr.map(t => decodeTrack(t, { image, now })).filter(t => t.artist && t.track);
  if (limit != null) tracks = tracks.slice(0, limit);
  return { playcount: Number(attr.total) || 0, tracks };
}

/**
 * The chart this site shows. Last.fm still accepts overall, 7day, 3month,
 * 6month, and 12month. The page and the worker ask only for the last month.
 */
export const LISTENING_PERIODS = [
  { id: '1month', label: '1 month' },
];

/** How many albums to keep for the cover grid. The page does not print ranks. */
export const TOP_LIMIT = 25;

/**
 * Extra loaded covers kept behind the grid. If one painted tile fails in the
 * browser, the page puts a spare in that same cell.
 */
export const COVER_SPARES = 4;

/**
 * How many chart rows to request so albums with no real cover can be skipped
 * and the grid can still fill from further down. One Last.fm page, not a loop.
 */
export const CHART_POOL = 100;

/**
 * Last.fm artwork CDNs. `user.gettopalbums` currently returns
 * `lastfm-img.freetls.fastly.net`. Older rows use `lastfm.freetls.fastly.net`.
 * Page img-src allows these hosts and nothing else.
 */
const LASTFM_IMAGE_HOSTS = new Set([
  'lastfm.freetls.fastly.net',
  'lastfm-img.freetls.fastly.net',
]);

/**
 * Last.fm artwork stand-ins. The first is the current gray star. The second
 * is an older default album image. `default_album` is the legacy file name.
 */
const LASTFM_PLACEHOLDER_ART = [
  '2a96cbd8b46e442fc41c2b86b821562f',
  'c6f59c1e5e7240a4c0d427abd71f3dbb',
];

/**
 * A Last.fm music URL. Profile URLs (`/user/…`) are dropped so the username
 * cannot ride along on a chart link. Anything else is dropped too.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function musicUrl(url) {
  const raw = String(url ?? '').trim();
  let parsed;
  try { parsed = new URL(raw); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return '';
  const host = parsed.hostname.toLowerCase();
  if (host !== 'www.last.fm' && host !== 'last.fm') return '';
  if (parsed.pathname.toLowerCase().includes('/user/')) return '';
  // Last.fm sometimes sends '+' already encoded twice (%252B). One decode
  // makes the album link resolvable. A single %2B is left alone.
  if (!raw.includes('%25')) return raw;
  try {
    const once = decodeURI(raw);
    const again = new URL(once);
    if (again.protocol !== 'https:' || again.username || again.password || again.port) return raw;
    const againHost = again.hostname.toLowerCase();
    if (againHost !== 'www.last.fm' && againHost !== 'last.fm') return raw;
    if (again.pathname.toLowerCase().includes('/user/')) return raw;
    return once;
  } catch {
    return raw;
  }
}

/**
 * @param {string} method
 * @param {string} user
 * @param {string} key
 * @param {string} period
 * @param {number} limit
 * @returns {string}
 */
function chartUrl(method, user, key, period, limit) {
  return `${API_ROOT}?method=${method}&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}&period=${encodeURIComponent(period)}&limit=${limit}&format=json`;
}

/** `user.gettopartists` request URL. */
export function topArtistsUrl(user, key, period, limit = TOP_LIMIT) {
  return chartUrl('user.gettopartists', user, key, period, limit);
}

/** `user.gettopalbums` request URL. */
export function topAlbumsUrl(user, key, period, limit = TOP_LIMIT) {
  return chartUrl('user.gettopalbums', user, key, period, limit);
}

/**
 * Last.fm returns one chart row as an object and several as an array.
 *
 * @param {unknown} raw
 * @returns {object[]}
 */
function chartRows(raw) {
  if (raw == null || raw === '') return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * @param {object} body  parsed `user.gettopartists` body
 * @param {number} [limit]
 * @returns {{ name: string, playcount: number, url: string }[]}
 */
export function decodeTopArtists(body, limit = TOP_LIMIT) {
  return chartRows(body?.topartists?.artist)
    .map((row) => ({
      name: String(row?.name || '').trim(),
      playcount: Number(row?.playcount) || 0,
      url: musicUrl(row?.url),
    }))
    .filter((row) => row.name)
    .slice(0, limit);
}

/**
 * A Last.fm cover URL. Only https on the artwork CDN is kept. The star
 * placeholder, the older default album image, and a `default_album` path
 * are treated as no art.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function albumImageUrl(url) {
  let parsed;
  try { parsed = new URL(String(url ?? '').trim()); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return '';
  if (!LASTFM_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) return '';
  const path = parsed.pathname.toLowerCase();
  if (path.includes('default_album')) return '';
  if (LASTFM_PLACEHOLDER_ART.some((hash) => path.includes(hash))) return '';
  return parsed.toString();
}

/**
 * True when `bytes` look like a JPEG, PNG, GIF, or WebP. A 200 that is HTML,
 * empty, or truncated is not a cover.
 *
 * @param {ArrayBuffer|Uint8Array|Buffer} bytes
 * @returns {boolean}
 */
export function coverBytesOk(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 24) return false;
  if (b[0] === 0xFF && b[1] === 0xD8) {
    const start = Math.max(2, b.length - 32);
    for (let i = b.length - 2; i >= start; i -= 1) {
      if (b[i] === 0xFF && b[i + 1] === 0xD9) return true;
    }
    return false;
  }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    const tail = b.subarray(Math.max(0, b.length - 16));
    for (let i = 0; i < tail.length - 3; i += 1) {
      if (tail[i] === 0x49 && tail[i + 1] === 0x45 && tail[i + 2] === 0x4E && tail[i + 3] === 0x44) {
        return true;
      }
    }
    return false;
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
  return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

/**
 * Whether a cover URL can be painted. `true` is image bytes on an allowed
 * host. `false` is a definite miss (404, HTML, placeholder, bad host).
 * `null` is inconclusive (timeout or a 5xx) and the caller keeps the URL.
 *
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean|null>}
 */
export async function coverLoads(url, fetchImpl = globalThis.fetch) {
  if (!albumImageUrl(url)) return false;
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { accept: 'image/jpeg,image/png,image/gif,image/webp' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    return null;
  }
  if (res.status === 404 || res.status === 410 || res.status === 400) return false;
  if (!res.ok) return null;
  const finalUrl = res.url || url;
  if (!albumImageUrl(finalUrl)) return false;
  const type = String(res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (type && type !== 'image/jpeg' && type !== 'image/jpg' && type !== 'image/pjpeg'
    && type !== 'image/png' && type !== 'image/gif' && type !== 'image/webp') {
    return false;
  }
  const length = Number(res.headers.get('content-length'));
  if (Number.isFinite(length) && length > 1_500_000) return false;
  let buf;
  try { buf = new Uint8Array(await res.arrayBuffer()); } catch { return null; }
  if (buf.length > 1_500_000) return false;
  return coverBytesOk(buf) ? true : false;
}

/**
 * URL-valid covers that load, in chart order, capped at `limit`. A definite
 * miss is skipped so the next row can fill the slot. An inconclusive check
 * keeps the row.
 *
 * @param {unknown} albums
 * @param {number} limit
 * @param {(url: string) => Promise<boolean|null>} load
 * @returns {Promise<object[]>}
 */
export async function keepLoadedCovers(albums, limit, load) {
  const cap = Number(limit);
  if (!(cap > 0)) return [];
  const candidates = albumsWithCovers(albums, Number.MAX_SAFE_INTEGER);
  const kept = [];
  for (const row of candidates) {
    const verdict = await load(row.image);
    if (verdict === false) continue;
    kept.push(row);
    if (kept.length >= cap) break;
  }
  return kept;
}

/**
 * Last.fm lists sizes smallest to largest. Walk from the end and skip the
 * placeholder so a real smaller image still wins when the largest is the star.
 *
 * @param {unknown} images
 * @returns {string}
 */
function largestAlbumImage(images) {
  if (!Array.isArray(images)) return '';
  for (let i = images.length - 1; i >= 0; i -= 1) {
    const safe = albumImageUrl(images[i]?.['#text']);
    if (safe) return safe;
  }
  return '';
}

/**
 * @param {unknown} artist
 * @returns {string}
 */
function albumArtist(artist) {
  if (artist == null) return '';
  if (typeof artist === 'string') return artist.trim();
  return String(artist.name || artist['#text'] || '').trim();
}

/**
 * @param {object} body  parsed `user.gettopalbums` body
 * @param {number} [limit]
 * @returns {{ name: string, artist: string, playcount: number, url: string, image: string }[]}
 */
export function decodeTopAlbums(body, limit = TOP_LIMIT) {
  return chartRows(body?.topalbums?.album)
    .map((row) => ({
      name: String(row?.name || '').trim(),
      artist: albumArtist(row?.artist),
      playcount: Number(row?.playcount) || 0,
      url: musicUrl(row?.url),
      image: largestAlbumImage(row?.image),
    }))
    .filter((row) => row.name)
    .slice(0, limit);
}

/**
 * Albums that have a real cover, in chart order. Missing art and the Last.fm
 * star are skipped so a later row can take the slot. The list stops at `limit`.
 *
 * @param {unknown} albums
 * @param {number} [limit]
 * @returns {object[]}
 */
export function albumsWithCovers(albums, limit = TOP_LIMIT) {
  if (!Array.isArray(albums) || !(limit > 0)) return [];
  const kept = [];
  for (const row of albums) {
    if (!row || typeof row !== 'object') continue;
    if (!String(row.name || '').trim()) continue;
    if (!albumImageUrl(row.image)) continue;
    kept.push(row);
    if (kept.length >= limit) break;
  }
  return kept;
}
