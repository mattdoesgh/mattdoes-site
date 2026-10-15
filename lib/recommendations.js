// lib/recommendations.js — non-dig picks for the grok page.
//
// Digs stay in content/digs/ and are the only copy of weekly music. This file
// is everything else the recommendations hub publishes (a book, a link, a
// note). Empty is fine: the hub still renders favorite digs from lib/digs.js.

import fs from 'node:fs';

/**
 * @param {string} file
 * @param {string} message
 */
function fail(file, message) {
  throw new Error(`${file}: ${message}`);
}

/**
 * @param {unknown} value
 * @param {string} file
 * @param {string} field
 * @returns {string}
 */
function linkUrl(value, file, field) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') fail(file, `${field} must be a string`);
  const s = value.trim();
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('..')) return s;
  let url;
  try { url = new URL(s); } catch { fail(file, `${field} is not a URL`); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') fail(file, `${field} must be http(s)`);
  return url.toString();
}

/**
 * @param {string} file  path used in errors
 * @returns {{ id: string, title: string, detail: string, href: string, kind: string, sample: boolean }[]}
 */
export function loadRecommendations(file) {
  if (!fs.existsSync(file)) return [];
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { fail(file, `invalid JSON (${err.message})`); }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.picks)) {
    fail(file, 'picks must be an array');
  }
  return raw.picks.map((pick, index) => {
    if (!pick || typeof pick !== 'object') fail(file, `picks[${index}] must be an object`);
    for (const key of ['title', 'detail']) {
      if (typeof pick[key] !== 'string' || !pick[key].trim()) fail(file, `picks[${index}].${key} is required`);
    }
    if (pick.sample != null && typeof pick.sample !== 'boolean') fail(file, `picks[${index}].sample must be a boolean`);
    const kind = pick.kind == null ? '' : String(pick.kind).trim().toLowerCase();
    if (kind.length > 24) fail(file, `picks[${index}].kind is too long`);
    return {
      id: `rec-${index}`,
      title: pick.title.trim(),
      detail: pick.detail.trim(),
      href: linkUrl(pick.href, file, `picks[${index}].href`),
      kind,
      sample: pick.sample === true,
    };
  });
}
