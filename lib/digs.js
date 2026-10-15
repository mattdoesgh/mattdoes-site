// lib/digs.js — weekly music digs (see CONTEXT.md: Digs).
//
// In-repo JSON under content/digs/, one file per week. Pure aside from the
// filesystem read: no clock, no network. Emit receives the loaded weeks; it
// does not fetch them. Favorites are a boolean on each pick — the grok page
// reads the same objects rather than a second copy of the week.
//
// Embeds are an allowlist (Apple Music + Bandcamp). Anything else fails the
// build so a week file cannot introduce a new frame-src origin by accident.

import fs from 'node:fs';
import path from 'node:path';

const WEEK_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * @param {string} file  label used in errors (vault-style: the filename)
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
function httpUrl(value, file, field) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') fail(file, `${field} must be a URL string`);
  let url;
  try { url = new URL(value); } catch { fail(file, `${field} is not a URL`); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    fail(file, `${field} must be http(s)`);
  }
  return url.toString();
}

/**
 * Iframe src allowlist. Hosts here must also be in static/_headers frame-src.
 *
 * @param {unknown} value
 * @param {string} file
 * @param {string} field
 * @returns {string}
 */
export function embedUrl(value, file, field) {
  const url = httpUrl(value, file, field);
  if (!url) return '';
  const parsed = new URL(url);
  const apple = parsed.protocol === 'https:' && parsed.hostname === 'embed.music.apple.com';
  const bandcamp = parsed.protocol === 'https:'
    && parsed.hostname === 'bandcamp.com'
    && parsed.pathname.startsWith('/EmbeddedPlayer/');
  if (!apple && !bandcamp) {
    fail(file, `${field} host is not an allowed player (${parsed.hostname})`);
  }
  return parsed.toString();
}

/**
 * @param {string} file
 * @param {unknown} raw
 * @param {string} weekOf
 */
function parseWeek(file, raw, weekOf) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(file, 'week must be an object');
  const data = /** @type {Record<string, unknown>} */ (raw);
  if (data.weekOf !== weekOf) {
    fail(file, `weekOf must match the filename (${weekOf})`);
  }
  if (!Array.isArray(data.picks) || data.picks.length === 0) {
    fail(file, 'picks must be a non-empty array');
  }
  if (data.sample != null && typeof data.sample !== 'boolean') fail(file, 'sample must be a boolean');

  const picks = data.picks.map((pick, index) => {
    if (!pick || typeof pick !== 'object') fail(file, `picks[${index}] must be an object`);
    const row = /** @type {Record<string, unknown>} */ (pick);
    for (const key of ['artist', 'blurb', 'starter']) {
      if (typeof row[key] !== 'string' || !row[key].trim()) fail(file, `picks[${index}].${key} is required`);
    }
    if (row.favorite != null && typeof row.favorite !== 'boolean') {
      fail(file, `picks[${index}].favorite must be a boolean`);
    }
    const appleMusic = httpUrl(row.appleMusic, file, `picks[${index}].appleMusic`);
    const bandcamp = httpUrl(row.bandcamp, file, `picks[${index}].bandcamp`);
    const appleMusicEmbed = embedUrl(row.appleMusicEmbed, file, `picks[${index}].appleMusicEmbed`);
    const bandcampEmbed = embedUrl(row.bandcampEmbed, file, `picks[${index}].bandcampEmbed`);
    if (!appleMusic && !bandcamp) fail(file, `picks[${index}] needs an Apple Music or Bandcamp link`);
    if (appleMusicEmbed && !appleMusic) fail(file, `picks[${index}] embed requires appleMusic`);
    if (bandcampEmbed && !bandcamp) fail(file, `picks[${index}] embed requires bandcamp`);
    return {
      id: `pick-${weekOf}-${index}`,
      artist: row.artist.trim(),
      blurb: row.blurb.trim(),
      starter: row.starter.trim(),
      favorite: row.favorite === true,
      appleMusic,
      appleMusicEmbed,
      bandcamp,
      bandcampEmbed,
    };
  });

  return {
    id: weekOf,
    weekOf,
    sample: data.sample === true,
    picks,
  };
}

/**
 * Load every week, newest first.
 *
 * @param {string} dir  content/digs directory
 * @returns {ReturnType<typeof parseWeek>[]}
 */
export function loadDigs(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  const weeks = files.map((name) => {
    const match = name.match(WEEK_FILE);
    if (!match) fail(name, 'filename must be YYYY-MM-DD.json');
    const full = path.join(dir, name);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(full, 'utf8')); }
    catch (err) { fail(name, `invalid JSON (${err.message})`); }
    return parseWeek(name, raw, match[1]);
  });
  weeks.sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  return weeks;
}

/**
 * Favorite picks across weeks, preserving newest-week order. Each entry is
 * the pick plus the week it belongs to — a view, not a second copy of the file.
 *
 * @param {ReturnType<typeof loadDigs>} weeks
 */
export function favoritePicks(weeks) {
  const out = [];
  for (const week of weeks) {
    for (const pick of week.picks) {
      if (!pick.favorite) continue;
      out.push({ ...pick, weekOf: week.weekOf, sample: week.sample });
    }
  }
  return out;
}
