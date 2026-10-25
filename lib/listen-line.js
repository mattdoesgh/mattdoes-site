// Home last.fm line. The label stays lowercase. The track and artist keep
// the casing Last.fm sent, the same way a film title does. One em dash
// joins them. A long pair is clipped so the row stays one line.

export const LISTEN_LIMIT = 48;

/**
 * `track — artist`, clipped to {@link LISTEN_LIMIT} with an ellipsis.
 * Empty when either side is missing, so a partial payload cannot wipe
 * the line the page already painted.
 *
 * @param {unknown} track
 * @param {unknown} artist
 * @returns {string}
 */
export function listenPair(track, artist) {
  const title = String(track ?? '').replace(/\s+/g, ' ').trim();
  const name = String(artist ?? '').replace(/\s+/g, ' ').trim();
  if (!title || !name) return '';
  const pair = `${title} \u2014 ${name}`;
  if (pair.length <= LISTEN_LIMIT) return pair;
  return `${pair.slice(0, LISTEN_LIMIT - 1).replace(/\s+$/u, '')}\u2026`;
}

/**
 * The line baked into the home row. Always "last listened": a build-time
 * now-playing flag would still be on the page with JavaScript off, long
 * after the song ended. Prefer the newest finished scrobble. A snapshot
 * that only has a live row still uses that title, under the same label.
 *
 * @param {unknown} tracks
 * @returns {{ state: 'last listened', pair: string, link: string } | null}
 */
export function staticListen(tracks) {
  const rows = (Array.isArray(tracks) ? tracks : [])
    .filter((row) => row && String(row.track || '').trim() && String(row.artist || '').trim());
  if (!rows.length) return null;
  const finished = rows.filter((row) => !row.nowPlaying);
  const pool = finished.length ? finished : rows;
  const chosen = pool
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  const pair = listenPair(chosen.track, chosen.artist);
  if (!pair) return null;
  return { state: 'last listened', pair, link: chosen.link || '' };
}

/**
 * What the home client should paint from `GET /api/listening/now`.
 * Null means keep the line already on the page (error, warming, or a
 * payload with no usable title).
 *
 * @param {unknown} data
 * @returns {{ state: string, pair: string, link: string, live: boolean } | null}
 */
export function listenView(data) {
  if (!data || typeof data !== 'object' || data.reason) return null;
  if (data.nowPlaying) {
    const pair = listenPair(data.track, data.artist);
    if (!pair) return null;
    return { state: 'now listening', pair, link: data.link || '', live: true };
  }
  const last = data.last;
  if (!last || typeof last !== 'object') return null;
  const pair = listenPair(last.track, last.artist);
  if (!pair) return null;
  return { state: 'last listened', pair, link: last.link || '', live: false };
}
