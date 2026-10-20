/**
 * The one scrobble-count format. The listen page and static/station.js both
 * render through this string so a live refresh does not flash a different
 * grouping.
 *
 * @param {unknown} n
 * @returns {string}
 */
export function formatScrobbleCount(n) {
  return Number(n || 0).toLocaleString('en-US');
}
