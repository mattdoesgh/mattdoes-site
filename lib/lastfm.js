// lib/lastfm.js — the Last.fm wire-format codec (see CONTEXT.md: Listening).
//
// Pure and isomorphic: URL builders and response decoders shared by the
// build-time snapshot (lib/listening.js) and the edge live-updater
// (workers/listening). No fetch, no fs, no config — each consumer keeps its
// own fetch/cache/error policy and stops hand-rolling the same query strings
// and field extraction.
//
// ⚠ Deploy coupling (ADR 0002): the listening Worker bundles this file at
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
