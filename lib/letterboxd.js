// lib/letterboxd.js — pure Letterboxd RSS codec.
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
 * Letterboxd poster URL from a diary description. Only the Letterboxd image
 * hosts are kept. The page never hotlinks this; lib/posters.js mirrors it.
 *
 * @param {string} description decoded description HTML
 * @returns {string}
 */
export function posterSource(description) {
  const html = String(description ?? '');
  const match = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (!match) return '';
  let url;
  try { url = new URL(match[1].trim()); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  if (url.hostname !== 'a.ltrbxd.com' && url.hostname !== 's.ltrbxd.com') return '';
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
      posterSource: posterSource(tag(body, 'description')),
    });
  }
  return items;
}

/**
 * The public films page for a Letterboxd profile. The lifetime watched
 * total is server-rendered there. The diary RSS has no total.
 *
 * @param {string} profile
 * @returns {string}
 */
export function filmsPageUrl(profile) {
  let url;
  try { url = new URL(String(profile || '').trim()); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  if (url.username || url.password || url.port) return '';
  if (url.hostname !== 'letterboxd.com' && url.hostname !== 'www.letterboxd.com') return '';
  const user = url.pathname.replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9]+$/.test(user)) return '';
  return `https://letterboxd.com/${user}/films/`;
}

const FILM_COUNT_LABEL = /^(\d{1,3}(?:,\d{3})*|\d+)\s+films?$/i;
const FILM_COUNT_MAX = 100_000;

/**
 * A Watched-heading tooltip such as `89 films` or `1,234 films`.
 * Zero and anything that is not a plain total are not a count.
 *
 * @param {string} raw
 * @returns {number|null}
 */
function filmCountFromLabel(raw) {
  const label = decodeXml(String(raw ?? '').replace(/&nbsp;/gi, ' '))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = label.match(FILM_COUNT_LABEL);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ''));
  if (!Number.isSafeInteger(n) || n <= 0 || n > FILM_COUNT_MAX) return null;
  return n;
}

/**
 * Lifetime films-watched count from a Letterboxd films page. The Watched
 * heading's tooltip is the total (`title="89&nbsp;films"`). Returns null
 * when that total is missing, zero, or not the heading's own label.
 *
 * @param {string} html
 * @returns {number|null}
 */
export function parseFilmCount(html) {
  const source = String(html ?? '');
  const re = /<h1\b[^>]*\bclass="[^"]*\bsection-heading\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/gi;
  let match;
  while ((match = re.exec(source))) {
    const inner = match[1];
    if (!/>\s*Watched\s*</i.test(inner)) continue;
    const title = inner.match(/\btitle="([^"]*)"/i);
    if (!title) return null;
    return filmCountFromLabel(title[1]);
  }
  return null;
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
