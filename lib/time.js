// lib/time.js — Node-side owner of the CT wall-clock primitives.
//
// Timestamp policy: the site's source-of-truth zone is America/Chicago
// (Central Time, DST-aware). Dates stored on disk are absolute instants
// (UTC); note-authored wall-clock values (frontmatter `date:`, daily-note
// "## HH:MM" headings) are interpreted in CT by Intake through this module.
//
// templates/_helpers.js ships to the browser via the importmap (hashed into
// dist/), so it cannot import this repo-relative module — it keeps its own
// private copy of `tzParts` for display formatting. test/time.test.js pins
// the two copies together (same pattern as theme-boot.js's accent palette,
// enforced by test/contrast.test.js). The conversion-direction functions
// (`tzOffsetMinutes`, `ctWallClockToDate`) live only here: the browser
// never converts wall-clock → instant.

export const SITE_TZ = 'America/Chicago';

// Wall-clock components of `instant` in America/Chicago. Intl emits "24"
// for midnight under hour12:false, so we normalize that to "00".
// DUPLICATED in templates/_helpers.js (browser-shipped) — keep the bodies
// identical; test/time.test.js enforces the sync.
export function tzParts(instant, tz = SITE_TZ) {
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
export function tzOffsetMinutes(instant, tz = SITE_TZ) {
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
 * into the UTC `Date` that corresponds to that moment. Used by Intake
 * when re-anchoring bare frontmatter dates to CT midnight and when
 * splitting daily-note "## HH:MM" headings into thought entries — those
 * headings are Matt's local time, not UTC.
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

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * CT calendar date of an instant as `'YYYYMMDD'` — the date half of a
 * thought id (`t-YYYYMMDD-HHMM`). Equivalent to _helpers' `fmtDate(d,
 * 'iso')` with the dashes stripped, without the display round-trip.
 *
 * @param {Date|string|number|null|undefined} d
 * @returns {string} `'YYYYMMDD'` in CT, or `''` for falsy/invalid input
 */
export function ctYmd(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const { year, month, day } = tzParts(date);
  return `${year}${pad2(month)}${pad2(day)}`;
}

/**
 * CT wall-clock time of an instant as `'HHMM'` — the time half of a
 * thought id. Equivalent to _helpers' `fmtTime(d)` with the colon
 * stripped.
 *
 * @param {Date|string|number|null|undefined} d
 * @returns {string} `'HHMM'` in CT, or `''` for falsy/invalid input
 */
export function ctHm(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const { hour, minute } = tzParts(date);
  return `${pad2(hour)}${pad2(minute)}`;
}
