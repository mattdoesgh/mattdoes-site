// Pure formatting + URL-sanitizing helpers, ported verbatim in behaviour from
// templates/_helpers.js. No JSX here — JSX escaping is React's job, so the
// HTML-escaping `esc()` of the original has no analogue.
//
// Timestamp policy (unchanged from the source): the site's source-of-truth
// zone is America/Chicago (Central Time, DST-aware). Dates are absolute
// instants; we format them in CT for display and emit machine-readable ISO on
// every <time> element so the client local-time script can layer a
// visitor-local tooltip.

export const SITE_TZ = 'America/Chicago';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export type DateInput = Date | string | number | null | undefined;
export type DateFormat = 'iso' | 'long' | 'month' | 'day' | 'time';

/**
 * Allowlist URL schemes for href attributes. Returns `'#'` for anything that
 * isn't http(s), mailto, tel, an anchor, or a same-origin path — so a
 * `javascript:`/`data:`/`vbscript:` URL slipping in from vault content (or an
 * upstream API like Last.fm) can't become a click-to-XSS.
 */
export function safeUrl(url: unknown): string {
  if (url == null) return '';
  const s = String(url).trim();
  if (s === '') return '';
  if (/^(https?:|mailto:|tel:|#)/i.test(s)) return s;
  if (s.startsWith('//')) return '#';
  if (s.startsWith('/') || s.startsWith('./')) {
    const pathPart = s.split(/[?#]/, 1)[0];
    let decoded = pathPart;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      /* keep raw */
    }
    if (decoded.split('/').includes('..')) return '#';
    return s;
  }
  return '#';
}

/**
 * `rel` attribute value for off-origin URLs (`'noopener noreferrer'`), or
 * `undefined` for relative paths / safe schemes. Mirrors `relFor()` from the
 * source, returned as a React-friendly attribute value rather than a string
 * fragment.
 */
export function relValue(url: unknown): string | undefined {
  if (url == null) return undefined;
  return /^(https?:)?\/\//i.test(String(url).trim()) ? 'noopener noreferrer' : undefined;
}

// Wall-clock components of `instant` in America/Chicago. Intl emits "24" for
// midnight under hour12:false, so we normalize that to "00".
function tzParts(instant: Date, tz = SITE_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const o: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return {
    year: Number(o.year),
    month: Number(o.month),
    day: Number(o.day),
    hour: Number(o.hour),
    minute: Number(o.minute),
    second: Number(o.second || 0),
  };
}

function toDate(d: DateInput): Date | null {
  if (!d && d !== 0) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

/** Format a date as `HH:MM` in America/Chicago. `''` for falsy/invalid input. */
export function fmtTime(d: DateInput): string {
  const date = toDate(d);
  if (!date) return '';
  const { hour, minute } = tzParts(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Format a date in America/Chicago. `fmt`:
 *  - `'iso'`   → `'YYYY-MM-DD'`
 *  - `'long'`  → `'YYYY·MM·DD'`
 *  - `'month'` → `'mon · YYYY'`
 *  - `'day'`   → `'mon DD'` (default)
 *  - `'time'`  → `'HH:MM'`
 */
export function fmtDate(d: DateInput, fmt: DateFormat = 'day'): string {
  if (fmt === 'time') return fmtTime(d);
  const date = toDate(d);
  if (!date) return '';
  const { year, month, day } = tzParts(date);
  const mon = MONTHS[month - 1];
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  if (fmt === 'iso') return `${year}-${mm}-${dd}`;
  if (fmt === 'long') return `${year}·${mm}·${dd}`;
  if (fmt === 'month') return `${mon} · ${year}`;
  return `${mon} ${dd}`;
}

/** ISO 8601 string for a `<time datetime>` attribute, or `''` when invalid. */
export function isoAttr(d: DateInput): string {
  const date = toDate(d);
  return date ? date.toISOString() : '';
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tag chips as an HTML string — the bridge for the `ThoughtRow` `html` path,
 * where pre-rendered markdown and its trailing tags share one block via
 * `dangerouslySetInnerHTML`. Must stay byte-identical to the `<Tag>` markup.
 * Not needed when composing with `children` — use `<TagList>` there.
 */
export function tagsHtml(tags: string[], baseHref = ''): string {
  return tags
    .map(
      (t) =>
        `<a class="tg" href="${baseHref}?tag=${encodeURIComponent(t)}" data-tag="${escHtml(t)}">${escHtml(t)}</a>`,
    )
    .join(' ');
}
