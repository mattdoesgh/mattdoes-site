// lib/letterboxd.js — pure Letterboxd RSS codec (see CONTEXT.md: Watches).
//
// No fetch, no fs. The build-time snapshot (lib/watches.js) owns the network
// and the disk cache. The page shows a recent window, not a full diary: the
// feed is already Letterboxd's recent activity, and selectRecentWatches caps
// it (default 25). Items without a film title (lists, follows) are dropped.

const WATCHED_ON = /^(re)?watched on\b/i;
const REVIEW_MAX = 280;

/**
 * @param {string} raw
 * @returns {string}
 */
function decodeXml(raw) {
  return String(raw ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * @param {string} body
 * @param {string} name
 * @returns {string}
 */
function tag(body, name) {
  const re = new RegExp(
    `<${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${name}>`,
    'i',
  );
  const match = body.match(re);
  if (!match) return '';
  return decodeXml(match[1] ?? match[2] ?? '').trim();
}

/**
 * Plain-text review. Drops the poster and Letterboxd's "Watched on …" stub.
 *
 * @param {string} description
 * @returns {string}
 */
export function reviewText(description) {
  const withoutTags = decodeXml(description)
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const kept = withoutTags
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !WATCHED_ON.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!kept) return '';
  if (kept.length <= REVIEW_MAX) return kept;
  const cut = kept.slice(0, REVIEW_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Keep a Letterboxd film URL. Anything else (javascript:, other hosts) is
 * dropped so a poisoned item cannot become a link.
 *
 * @param {string} value
 * @returns {string}
 */
export function letterboxdUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  if (url.hostname !== 'letterboxd.com' && url.hostname !== 'www.letterboxd.com') return '';
  return url.toString();
}

/**
 * @param {unknown} rating  Letterboxd memberRating, out of 5
 * @returns {string} star string, or '' when unrated
 */
export function ratingStars(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n) || n <= 0) return '';
  const clamped = Math.min(5, n);
  const full = Math.floor(clamped);
  const half = clamped - full >= 0.5 ? '½' : '';
  return `${'★'.repeat(full)}${half}`;
}

/**
 * @param {string} xml
 * @returns {object[]}
 */
export function parseLetterboxdRss(xml) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(String(xml ?? '')))) {
    const body = match[1];
    const title = tag(body, 'letterboxd:filmTitle');
    if (!title) continue;
    const rating = tag(body, 'letterboxd:memberRating');
    const year = tag(body, 'letterboxd:filmYear');
    items.push({
      title,
      year: /^\d{4}$/.test(year) ? year : '',
      rating: rating ? Number(rating) : null,
      stars: ratingStars(rating),
      watchedDate: tag(body, 'letterboxd:watchedDate'),
      rewatch: /^yes$/i.test(tag(body, 'letterboxd:rewatch')),
      link: letterboxdUrl(tag(body, 'link')),
      review: reviewText(tag(body, 'description')),
    });
  }
  return items;
}

/**
 * Newest watchedDate first, RSS order as the tiebreak. Caps the page at
 * `limit` (the recent window — not the full diary).
 *
 * @param {object[]} items
 * @param {number} [limit]
 */
export function selectRecentWatches(items, limit = 25) {
  const ranked = items.map((item, index) => ({ item, index }));
  ranked.sort((a, b) => {
    const da = a.item.watchedDate || '';
    const db = b.item.watchedDate || '';
    if (da !== db) return db.localeCompare(da);
    return a.index - b.index;
  });
  const cap = Number.isFinite(limit) && limit > 0 ? limit : 25;
  return ranked.slice(0, cap).map((row) => row.item);
}
