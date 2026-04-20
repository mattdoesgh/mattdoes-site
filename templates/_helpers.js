// Small shared helpers.
//
// Timestamp policy: the site's source-of-truth zone is America/Chicago
// (Central Time, DST-aware). All dates stored on disk are absolute
// instants (UTC) — we format them in CT for display and emit machine-
// readable ISO on every <time> element so a small client script can
// layer a visitor-local tooltip on top.

export const SITE_TZ = 'America/Chicago';

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

// Parse (year, month, day, hour, minute) interpreted as CT wall-clock
// into the UTC Date that corresponds to that moment. Used by build.js
// when splitting daily-note "## HH:MM" headings into thought entries —
// those headings are Matt's local time, not UTC.
export function ctWallClockToDate(year, month, day, hour = 0, minute = 0) {
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMinutes(naive);
  return new Date(naive.getTime() - offset * 60_000);
}

// Short tz abbrev for display ("CDT"/"CST"). Falls back to "CT".
export function tzAbbrev(instant, tz = SITE_TZ) {
  const d = instant instanceof Date ? instant : new Date(instant);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'short', year: 'numeric',
  }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value;
  return name || 'CT';
}

// HH:MM in America/Chicago.
export function fmtTime(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const { hour, minute } = tzParts(date);
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}

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

// Format a bare "YYYY-MM-DD" (e.g. a group key already computed in CT) as
// "mon dd" without any timezone conversion. `fmtDate` can't be used here
// because it would re-parse the string as UTC midnight and render it in
// CT, shifting the label back a day.
export function fmtIsoDay(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${MONTHS[Number(m[2]) - 1]} ${m[3]}`;
}

// Wrap a date in a <time> element with its ISO datetime + class="ts",
// rendered text formatted in CT. The class is the contract local-time.js
// looks for when layering a visitor-local tooltip (title attr). `extra`
// lets callers append additional attributes (e.g. aria-labels).
export function timeTag(d, fmt = 'day', extra = '') {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const iso = date.toISOString();
  const text = fmt === 'time' ? fmtTime(date) : fmtDate(date, fmt);
  return `<time class="ts" datetime="${iso}"${extra ? ' ' + extra : ''}>${esc(text)}</time>`;
}

export function relTime(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600)  return `${Math.max(1, Math.round(diff/60))}m`;
  if (diff < 86400) return `${Math.round(diff/3600)}h`;
  if (diff < 86400 * 7) return `${Math.round(diff/86400)}d`;
  return fmtDate(d, 'day');
}

export function tagList(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(t => `<a class="tg" href="/tags/${encodeURIComponent(t)}/">${esc(t)}</a>`).join(' ');
}
