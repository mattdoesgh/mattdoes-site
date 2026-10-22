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

/** Last.fm's default star, returned when an album has no artwork. */
const LASTFM_PLACEHOLDER_ART = '2a96cbd8b46e442fc41c2b86b821562f';

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
 * A Last.fm cover URL. Only https on the artwork CDN is kept. The default
 * star placeholder is treated as no art so the page can draw a plain tile.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function albumImageUrl(url) {
  let parsed;
  try { parsed = new URL(String(url ?? '').trim()); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return '';
  if (!LASTFM_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) return '';
  if (parsed.pathname.includes(LASTFM_PLACEHOLDER_ART)) return '';
  return parsed.toString();
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
