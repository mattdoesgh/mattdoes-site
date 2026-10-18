// lib/intake.js — Note intake: Note records → Content model.
//
// readNotes(contentDir) is the only filesystem code here: it walks a content
// directory (default content/ in the repo) and returns Note records
// ({ rel, content, mtime }). intake(records) is pure and deterministic —
// same records in, same model out; no clock, no fs, no env. All loud-failure
// validation lives behind this interface, and every error message names the
// offending path so an author can find the note.
//
// The Content model carries raw markdown only — rendering (Shiki,
// wikilinks, embeds) is Emit's concern (lib/emit/).

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { ctWallClockToDate } from './time.js';
import { SECTIONS, RETIRED_PUBLISH_KINDS } from './sections.js';

/**
 * Frontmatter dates without a time component (e.g. `date: 2026-04-19`)
 * are parsed by js-yaml as UTC midnight — which lands on the previous
 * calendar day in CT. Re-anchor them to CT midnight so posts don't
 * appear to be from the day before. Values with a time or offset are
 * left as-is: the author was explicit.
 *
 * @param {Date|string|null|undefined} v raw frontmatter value
 * @returns {Date|null} parsed UTC instant, or `null` for nullish input
 */
function parseFrontmatterDate(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    // YAML delivers strings only for values it couldn't parse as a date
    // (rare), or for full ISO timestamps inside quotes. A bare "YYYY-MM-DD"
    // string gets reinterpreted as CT midnight; anything richer goes
    // through the Date constructor untouched.
    const bare = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (bare) return ctWallClockToDate(+bare[1], +bare[2], +bare[3], 0, 0);
    return new Date(v);
  }
  if (v instanceof Date) {
    // js-yaml emits Dates at UTC midnight for bare YYYY-MM-DD values.
    // Detect that exact shape and reinterpret as CT midnight.
    if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0 && v.getUTCMilliseconds() === 0) {
      return ctWallClockToDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), 0, 0);
    }
    return v;
  }
  return new Date(v);
}

/**
 * Recursively collect every `.md` file under `dir`. Dotfiles and dot
 * directories are skipped. JSON siblings such as `content/digs/` and
 * `content/recommendations.json` are not notes.
 *
 * @param {string} root content root (for error paths)
 * @param {string} dir absolute directory to scan
 * @param {string[]} [out=[]] accumulator (recursion); callers omit this
 * @returns {string[]} absolute paths to `.md` files
 */
function walk(root, dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to read symlinked note: ${path.relative(root, full) || full}`);
    }
    if (stat.isDirectory()) walk(root, full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

/**
 * Read a content directory into Note records — the seam between the
 * filesystem and the pure intake. `mtime` exists only as the `date:`
 * frontmatter fallback.
 *
 * @param {string} contentDir absolute path to the content root
 * @returns {Array<{ rel: string, content: string, mtime: Date }>}
 */
export function readNotes(contentDir) {
  return walk(contentDir, contentDir).map(file => ({
    rel: path.relative(contentDir, file),
    content: fs.readFileSync(file, 'utf8'),
    mtime: fs.statSync(file).mtime,
  }));
}

/**
 * Lowercase + kebab-case a string for use as a URL slug.
 *
 * @param {unknown} s
 * @returns {string} `a-z0-9-` only, with no leading/trailing dash
 */
function kebab(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// A valid explicit slug is exactly one lowercase URL segment: lowercase
// alphanumerics in hyphen-separated groups. This rejects slashes (route
// escape / extra path segments), `..` (directory traversal), quotes and
// other attribute-breaking characters, and leading/trailing/double hyphens.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// `publish:` values that select a render target. Anything else is an
// authoring mistake and must fail the build loudly; nullish/`draft` are
// handled before this set is consulted (those notes are simply skipped).
const PUBLISH_KINDS = new Set([
  ...Object.keys(SECTIONS).filter(k => SECTIONS[k].publishKind),
  'about',
  'draft',
  // Retired public kinds. Still accepted so an older note builds, and
  // still not added to any public list.
  ...RETIRED_PUBLISH_KINDS,
]);

const RETIRED = new Set(RETIRED_PUBLISH_KINDS);

/**
 * Parse a note's leading YAML frontmatter without the vulnerable js-yaml path
 * pulled in by gray-matter. Only a top-of-file `---` block is recognized; the
 * body is returned unchanged when no block exists.
 *
 * @param {string} raw note file contents
 * @returns {{ data: Record<string, unknown>, content: string }}
 */
function parseNote(raw) {
  const src = String(raw || '').replace(/^\uFEFF/, '');
  if (!src.startsWith('---\n') && !src.startsWith('---\r\n')) {
    return { data: {}, content: src };
  }
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { data: {}, content: src };
  const data = YAML.parse(match[1]) || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { data: {}, content: src.slice(match[0].length) };
  }
  return { data, content: src.slice(match[0].length) };
}

/**
 * Map a note to its public URL based on its `publish:` frontmatter.
 *
 * @param {{ publish: string, slug: string }} note
 * @returns {string} path beginning and ending in `/`
 */
function routeFor(note) {
  // Retired kinds keep a collision key so two notes cannot claim the same
  // slug, but Emit does not write that path.
  if (note.publish === 'journal' || note.publish === 'making') {
    return `/${note.publish}/${note.slug}/`;
  }
  const section = SECTIONS[note.publish];
  if (section) {
    return section.articlePages ? `${section.route}${note.slug}/` : section.route;
  }
  return `/${note.slug}/`;
}

/**
 * @typedef {object} ContentModel
 * @property {object[]} notes     every published note (raw markdown body)
 * @property {object[]} about     `publish: about` notes (length 0 or 1)
 * @property {Map<string, { url: string, title: string }>} slugIndex
 *   wikilink-resolution index: basename, slug, lowercased title, and every
 *   alias of each routed note
 */

/**
 * Turn Note records into the Content model. Pure and deterministic: no
 * clock, no fs, no env. Throws on the first invalid note, with a message
 * naming its path relative to the content directory.
 *
 * @param {Array<{ rel: string, content: string, mtime: Date }>} records
 * @returns {ContentModel}
 */
export function intake(records) {
  const notes = [];
  // Resolved public route → first source file that claimed it. Two notes
  // resolving to the same route would have one silently overwrite the other
  // in dist/ while indexes still link both — so a collision fails the build.
  const routeOwners = new Map();
  for (const record of records) {
    const { data, content } = parseNote(record.content);
    const rel = record.rel;
    // Validate `publish` before the skip check: an unrecognized non-nullish
    // value (e.g. a typo'd `publsh: journal` landing under `publish:`) is an
    // authoring mistake that would otherwise silently drop the note.
    if (data.publish != null && !PUBLISH_KINDS.has(data.publish)) {
      throw new Error(`Invalid frontmatter: ${rel} has publish: "${data.publish}" — must be one of ${[...PUBLISH_KINDS].join('/')}.`);
    }
    if (!data.publish || data.publish === 'draft') continue;
    const base = path.basename(rel, '.md');

    // Slug: an explicit `slug:` must be a single safe URL segment; the
    // kebab() fallback (from title or filename) must be non-empty.
    let slug;
    if (data.slug != null && data.slug !== '') {
      slug = String(data.slug);
      if (!SLUG_RE.test(slug)) {
        throw new Error(`Invalid frontmatter: ${rel} has slug: "${slug}" — must be one lowercase URL segment (a-z0-9, hyphen-separated, no slashes, dots, quotes, or leading/trailing/double hyphens).`);
      }
    } else {
      slug = kebab(data.title || base);
      if (!slug) {
        throw new Error(`Invalid frontmatter: ${rel} produced an empty slug from its title/filename — set an explicit slug:.`);
      }
    }

    // Shape checks: tags/aliases must be arrays if present; date/updated, if
    // present, must parse to a valid Date (an unparseable value yields a
    // Date whose getTime() is NaN — reject it rather than emitting Invalid Date).
    if (data.tags != null && !Array.isArray(data.tags)) {
      throw new Error(`Invalid frontmatter: ${rel} has a non-array tags: value.`);
    }
    if (data.aliases != null && !Array.isArray(data.aliases)) {
      throw new Error(`Invalid frontmatter: ${rel} has a non-array aliases: value.`);
    }
    let parsedDate = null, parsedUpdated = null;
    if (data.date != null) {
      parsedDate = parseFrontmatterDate(data.date);
      if (!(parsedDate instanceof Date) || isNaN(parsedDate)) {
        throw new Error(`Invalid frontmatter: ${rel} has an unparseable date: value.`);
      }
    }
    if (data.updated != null) {
      parsedUpdated = parseFrontmatterDate(data.updated);
      if (!(parsedUpdated instanceof Date) || isNaN(parsedUpdated)) {
        throw new Error(`Invalid frontmatter: ${rel} has an unparseable updated: value.`);
      }
    }

    const note = {
      rel, base, body: content,
      frontmatter: data,
      publish: data.publish,
      title:   data.title || base,
      date:    parsedDate || record.mtime,
      updated: parsedUpdated,
      slug,
      tags:    data.tags || [],
      summary: data.summary || '',
      aliases: data.aliases || [],
    };

    // Duplicate-route detection. Thought notes share no public page, so
    // they are exempt. Journal and making still collide on slug even
    // though those paths are not written.
    if (note.publish !== 'thoughts') {
      const route = routeFor(note);
      const owner = routeOwners.get(route);
      if (owner) {
        throw new Error(`Duplicate route ${route}: claimed by both ${owner} and ${rel}.`);
      }
      routeOwners.set(route, rel);
    }

    notes.push(note);
  }

  // Slug index for wikilink resolution (consumed by Emit's renderer).
  const slugIndex = new Map();
  for (const n of notes) {
    // Unpublished kinds must not become wikilinks to routes Emit will not write.
    if (RETIRED.has(n.publish)) continue;
    const route = routeFor(n);
    slugIndex.set(n.base,  { url: route, title: n.title });
    slugIndex.set(n.slug,  { url: route, title: n.title });
    slugIndex.set(n.title.toLowerCase(), { url: route, title: n.title });
    for (const a of n.aliases) slugIndex.set(a, { url: route, title: n.title });
  }

  const about = [];   // publish: about — singleton, but collected as a list
                       // so a stray duplicate fails loud rather than
                       // silently shadowing the canonical /about/.

  for (const n of notes) {
    if (n.publish === 'about') about.push({ ...n, url: '/about/' });
  }

  // /about/ is a singleton surface. More than one `publish: about` note can't
  // both own it — the second would silently overwrite the first in dist/
  // while still being linked. Fail the build naming every offender.
  if (about.length > 1) {
    throw new Error(`Multiple publish: about notes — only one is allowed: ${about.map(n => n.rel).join(', ')}.`);
  }

  return { notes, about, slugIndex };
}
