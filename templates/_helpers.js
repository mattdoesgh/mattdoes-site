// Small shared helpers.
//
// Timestamp policy: the site's source-of-truth zone is America/Chicago
// (Central Time, DST-aware). All dates stored on disk are absolute
// instants (UTC) — we format them in CT for display and emit machine-
// readable ISO on every <time> element so a small client script can
// layer a visitor-local tooltip on top.

export const SITE_TZ = 'America/Chicago';

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/**
 * HTML-escape a value for safe interpolation into element content or
 * double-quoted attributes. Coerces non-string input via `String()`, so
 * passing `null`/`undefined` yields `''` rather than throwing.
 *
 * @param {unknown} s value to escape
 * @returns {string} HTML-safe string
 */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Allowlist URL schemes for href attributes. Returns `'#'` for anything that
 * isn't http(s), mailto, tel, an anchor, or a same-origin path — so a
 * `javascript:`/`data:`/`vbscript:` URL slipping into vault content (or
 * returned by an upstream API like Last.fm) can't become a click-to-XSS.
 * Use this to wrap any URL that originates outside the build pipeline
 * before interpolating it into an `href` attribute.
 *
 * @param {unknown} url URL (any source) to sanitize
 * @returns {string} the URL if it matches an allowed scheme; `'#'` otherwise; `''` for nullish/empty
 */
export function safeUrl(url) {
  if (url == null) return '';
  const s = String(url).trim();
  if (s === '') return '';
  if (/^(https?:|mailto:|tel:|#)/i.test(s)) return s;
  if (s.startsWith('//')) return '#';
  if (s.startsWith('/') || s.startsWith('./')) {
    const pathPart = s.split(/[?#]/, 1)[0];
    let decoded = pathPart;
    try { decoded = decodeURIComponent(pathPart); } catch { /* keep raw */ }
    if (decoded.split('/').includes('..')) return '#';
    return s;
  }
  return '#';
}

/**
 * Emit ` rel="noopener noreferrer"` for off-origin URLs and nothing for
 * relative paths or other safe schemes. Matches both absolute http(s) URLs
 * and protocol-relative `//host/path` URLs — `safeUrl()` permits the latter,
 * so they need the same external-link protections. Keeps the referrer off
 * off-origin destinations and stops same-tab opener tabnabbing if the link
 * is ever switched to `target=_blank`.
 *
 * @param {unknown} url URL to inspect
 * @returns {string} attribute fragment (with leading space) or `''`
 */
export function relFor(url) {
  if (url == null) return '';
  return /^(https?:)?\/\//i.test(String(url).trim()) ? ' rel="noopener noreferrer"' : '';
}

// Wall-clock components of `instant` in America/Chicago. Intl emits "24"
// for midnight under hour12:false, so we normalize that to "00".
function tzParts(instant, tz = SITE_TZ) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return {
    year: Number(o.year), month: Number(o.month), day: Number(o.day),
    hour: Number(o.hour), minute: Number(o.minute), second: Number(o.second || 0),
  };
}

// Offset (minutes east of UTC) of SITE_TZ at a given instant. CT ranges
// from -360 (CST) to -300 (CDT).
function tzOffsetMinutes(instant, tz = SITE_TZ) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'shortOffset', year: 'numeric',
  }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || '';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
}

/**
 * Parse `(year, month, day, hour, minute)` interpreted as CT wall-clock
 * into the UTC `Date` that corresponds to that moment. Used by build.js
 * when splitting daily-note "## HH:MM" headings into thought entries —
 * those headings are Matt's local time, not UTC.
 *
 * @param {number} year  full year, e.g. 2026
 * @param {number} month 1-based month (1–12)
 * @param {number} day   day of month (1–31)
 * @param {number} [hour=0]   hour of day (0–23) in CT
 * @param {number} [minute=0] minute (0–59) in CT
 * @returns {Date} the UTC instant matching the given CT wall-clock
 */
export function ctWallClockToDate(year, month, day, hour = 0, minute = 0) {
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMinutes(naive);
  return new Date(naive.getTime() - offset * 60_000);
}

/**
 * Short tz abbrev for display (`"CDT"` / `"CST"`). Falls back to `"CT"`.
 *
 * @param {Date|string|number} instant date or anything `new Date()` accepts
 * @param {string} [tz=SITE_TZ] IANA timezone
 * @returns {string} short timezone label
 */
export function tzAbbrev(instant, tz = SITE_TZ) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'short', year: 'numeric',
  }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value;
  return name || 'CT';
}

/**
 * Format a date as `HH:MM` in America/Chicago.
 *
 * @param {Date|string|number|null|undefined} d
 * @returns {string} `'HH:MM'`, or `''` for falsy/invalid input
 */
export function fmtTime(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const { hour, minute } = tzParts(date);
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

/**
 * Format a date in America/Chicago. Supported `fmt` values:
 *  - `'iso'`   → `'YYYY-MM-DD'`
 *  - `'long'`  → `'YYYY·MM·DD'`
 *  - `'month'` → `'mon · YYYY'`
 *  - `'day'`   → `'mon DD'`  (default for any other input)
 *
 * @param {Date|string|number|null|undefined} d
 * @param {'iso'|'long'|'month'|'day'|string} [fmt='day']
 * @returns {string} formatted date, or `''` for invalid input
 */
export function fmtDate(d, fmt = 'apr 17') {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const { year, month, day } = tzParts(date);
  const mon = MONTHS[month - 1];
  const mm  = String(month).padStart(2, '0');
  const dd  = String(day).padStart(2, '0');
  if (fmt === 'iso')   return `${year}-${mm}-${dd}`;
  if (fmt === 'long')  return `${year}·${mm}·${dd}`;
  if (fmt === 'month') return `${mon} · ${year}`;
  if (fmt === 'day')   return `${mon} ${dd}`;
  return `${mon} ${dd}`;
}

/**
 * Format a bare `"YYYY-MM-DD"` (e.g. a group key already computed in CT)
 * as `"mon dd"` without any timezone conversion. `fmtDate` can't be used
 * here because it would re-parse the string as UTC midnight and render
 * it in CT, shifting the label back a day.
 *
 * @param {string} iso a `'YYYY-MM-DD'` string (already in CT)
 * @returns {string} `'mon dd'`, or `''` for malformed input
 */
export function fmtIsoDay(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${m[3]}`;
}

/**
 * Wrap a date in a `<time>` element with its ISO `datetime` + `class="ts"`,
 * rendered text formatted in CT. The class is the contract local-time.js
 * looks for when layering a visitor-local tooltip (title attr).
 *
 * @param {Date|string|number|null|undefined} d
 * @param {'iso'|'long'|'month'|'day'|'time'|string} [fmt='day'] format (`'time'` renders HH:MM)
 * @param {string} [extra=''] additional attributes to append, e.g. `'aria-label="published"'`
 * @returns {string} `<time …>…</time>` markup, or `''` for invalid input
 */
export function timeTag(d, fmt = 'day', extra = '') {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const iso = date.toISOString();
  const text = fmt === 'time' ? fmtTime(date) : fmtDate(date, fmt);
  return `<time class="ts" datetime="${iso}"${extra ? ' ' + extra : ''}>${esc(text)}</time>`;
}

/**
 * Compact "time ago" label for the home feed. Falls back to `'mon dd'`
 * once the event is over a week old.
 *
 * @param {Date|string|number|null|undefined} iso
 * @returns {string} e.g. `'2m'`, `'3h'`, `'4d'`, or `'apr 17'`
 */
export function relTime(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600)  return `${Math.max(1, Math.round(diff/60))}m`;
  if (diff < 86400) return `${Math.round(diff/3600)}h`;
  if (diff < 86400 * 7) return `${Math.round(diff/86400)}d`;
  return fmtDate(d, 'day');
}

/**
 * Render a list of inline tag chips. `baseHref` is the page the tag should
 * scope to — `''` (default) means current page, so the link is just
 * `?tag=foo` and tag-filter.js can apply it in place. Article pages pass
 * e.g. `'/journal/'` so a click jumps to the journal index already
 * filtered.
 *
 * @param {string[]|undefined|null} tags
 * @param {string} [baseHref=''] e.g. `'/journal/'`
 * @returns {string} space-joined `<a class="tg">` chips, or `''` if no tags
 */
export function tagList(tags, baseHref = '') {
  if (!tags || !tags.length) return '';
  return tags.map(t => {
    const href = `${baseHref}?tag=${encodeURIComponent(t)}`;
    return `<a class="tg" href="${href}" data-tag="${esc(t)}">${esc(t)}</a>`;
  }).join(' ');
}
