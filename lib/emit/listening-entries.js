// lib/emit/listening-entries.js — Listening snapshot → page entries for Emit.
//
// The one mapping from Last.fm snapshot rows (lib/listening.js) to the entry
// shape the /listening/ page and templates/rows.js consume. Shared with
// test/row-parity.test.js so the parity test exercises the real mapping
// instead of a reimplementation.

import { safeUrl } from '../../templates/_helpers.js';

/**
 * Map Listening snapshot rows to listening entries: keep dated tracks,
 * normalize the link, sort newest-first, optionally cap. Pure.
 *
 * @param {object[]} tracks snapshot rows (see lib/listening.js)
 * @param {number}  [limit] max entries (default: all)
 * @returns {object[]} listening entries, newest first
 */
export function toListeningEntries(tracks, limit = Infinity) {
  return tracks
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
      date:   new Date(t.date),
      nowPlaying: t.nowPlaying,
      url: '/listening/',
      tags: [],
    }))
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);
}
