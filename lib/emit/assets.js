// lib/emit/assets.js — file plumbing + static-asset minify/hash for Emit.
//
// Owns everything that moves bytes into dist/ without rendering them: page
// writes, static-tree copies, the
// minify + content-hash pipeline for CSS/JS, and the Early Hints Link
// headers derived from the hashed filenames.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { transform as cssTransform } from 'lightningcss';
import { minify as jsMinify } from 'terser';
import { inlineStaticTokens } from '../design-tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── file plumbing ────────────────────────────────────────────────────────
/**
 * Write `html` to `<distDir>/<urlPath>/index.html`, creating any missing
 * intermediate directories. The route prefix is stripped of leading
 * slashes before joining.
 *
 * @param {string} distDir resolved dist root
 * @param {string} urlPath e.g. `'/journal/foo/'`
 * @param {string} html
 * @returns {void}
 */
export function writePage(distDir, urlPath, html) {
  const dest = path.join(distDir, urlPath.replace(/^\//, ''), 'index.html');
  // Defense in depth: even though slugs are validated at intake time, assert
  // the resolved output path never escapes distDir before writing — a bad
  // route reaching here must fail loudly, never overwrite a file elsewhere.
  if (!path.resolve(dest).startsWith(distDir + path.sep)) {
    throw new Error(`Refusing to write outside dist/: route "${urlPath}" resolved to ${path.resolve(dest)}.`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

/**
 * Recursively copy a directory tree, replacing existing files. Tolerant
 * of EPERM/unlink errors caused by mounted filesystems (e.g. project
 * directories on iCloud Drive) — those files are skipped silently.
 *
 * @param {string} from source directory
 * @param {string} to destination directory (created on demand)
 * @returns {void}
 */
export function copyStatic(from, to) {
  if (!fs.existsSync(from)) return;
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    const stat = fs.lstatSync(src);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to copy symlinked asset: ${src}`);
    }
    if (stat.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copyStatic(src, dst); }
    else {
      // Tolerate mounted-FS quirks: if destination can't be unlinked, skip.
      try { if (fs.existsSync(dst)) fs.unlinkSync(dst); } catch (e) {}
      try { fs.copyFileSync(src, dst); } catch (e) {
        if (e.code !== 'EPERM') throw e;
      }
    }
  }
}

// ── asset name contract ──────────────────────────────────────────────────
/**
 * The shipped CSS/JS asset list, derived from disk instead of a hand-written
 * name list: every top-level `static/*.css` and `static/*.js`. Dropping a
 * file into static/ is enough to get it minified + hashed. The minifier kind
 * is detected from the source: files with top-level `import`/`export` are ES
 * modules (`'mjs'`), everything else is a classic script.
 *
 * @param {string} staticDir the repo static/ tree
 * @returns {Array<[string, 'css'|'js'|'mjs']>} `[filename, kind]` pairs,
 *   sorted by filename for deterministic processing order
 */
export function listShippedAssets(staticDir) {
  const jsKind = (file) =>
    /^\s*(import|export)\b/m.test(fs.readFileSync(file, 'utf8')) ? 'mjs' : 'js';
  const entries = [];
  for (const name of fs.readdirSync(staticDir)) {
    const file = path.join(staticDir, name);
    if (!fs.statSync(file).isFile()) continue;
    if (name.endsWith('.css'))     entries.push([name, 'css']);
    else if (name.endsWith('.js')) entries.push([name, jsKind(file)]);
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

// ── asset minify + content hash ──────────────────────────────────────────
/**
 * 8-hex-char content hash (truncated SHA-256). It fingerprints CSS/JS
 * filenames for immutable caching. Collisions at 32 bits are effectively
 * impossible for the ~10 assets this site ships.
 *
 * @param {Buffer|string} buf
 * @returns {string} 8-char hex string
 */
function hash8(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/**
 * Inline relative `@import` rules. The token file lives outside `static/`,
 * so the copied dist stylesheet still points at the repo path.
 *
 * @param {string} css
 * @param {string} fromFile absolute path the relative imports are resolved against
 * @returns {string}
 */
export function expandCssImports(css, fromFile) {
  return css.replace(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/g, (full, spec) => {
    if (!spec.startsWith('.')) return full;
    const file = path.resolve(path.dirname(fromFile), spec);
    if (!fs.existsSync(file)) {
      throw new Error(`CSS import not found: ${spec} (from ${fromFile})`);
    }
    return expandCssImports(fs.readFileSync(file, 'utf8'), file);
  });
}

/**
 * Minify + content-hash one asset already present in `distDir`. The original
 * is deleted and the hashed sibling is written next to it. CSS is run
 * through lightningcss; JS through terser (`'mjs'` for ES modules, so
 * import/export syntax parses and top-level names can be mangled safely).
 *
 * @param {string} distDir resolved dist root
 * @param {string} filename basename in `distDir` (e.g. `'_shared.css'`)
 * @param {'css'|'js'|'mjs'} kind which minifier to use
 * @returns {Promise<[string,string]|undefined>} `[original, hashed]` pair,
 *   or `undefined` if the source file is missing
 */
export async function processAsset(distDir, filename, kind) {
  const src = path.join(distDir, filename);
  if (!fs.existsSync(src)) return;
  const input = fs.readFileSync(src);
  let output;
  if (kind === 'css') {
    const repoFile = path.join(REPO_ROOT, 'static', filename);
    const importBase = fs.existsSync(repoFile) ? repoFile : src;
    const expanded = expandCssImports(input.toString('utf8'), importBase);
    const { code } = cssTransform({
      filename,
      code: Buffer.from(inlineStaticTokens(expanded)),
      minify: true,
      sourceMap: false,
    });
    // `<angle>` must survive minify. A mangled `syntax` drops the
    // @property registration and the glass sheen stops interpolating.
    output = Buffer.from(preserveAnglePropertySyntax(Buffer.from(code).toString('utf8')), 'utf8');
  } else {
    const result = await jsMinify(input.toString('utf8'), {
      module: kind === 'mjs',
      compress: true,
      mangle: true,
      format: { comments: false },
      sourceMap: false,
    });
    output = Buffer.from(result.code ?? input.toString('utf8'), 'utf8');
  }
  const ext  = path.extname(filename);
  const stem = path.basename(filename, ext);
  const hashed = `${stem}.${hash8(output)}${ext}`;
  fs.writeFileSync(path.join(distDir, hashed), output);
  try { fs.unlinkSync(src); } catch {}
  return [filename, hashed];
}

/**
 * Append per-deploy `Link: rel=preload` headers for the critical-path
 * hashed assets to `<distDir>/_headers`, so Cloudflare Pages converts them
 * to HTTP 103 Early Hints. Targets the dist copy (already populated by
 * the `copyStatic` in emit) — never the `static/` source — so each build
 * starts fresh and the rule doesn't compound across runs.
 *
 * @param {string} distDir resolved dist root
 * @param {Record<string, string>} map original → hashed filename
 * @returns {void}
 */
export function emitEarlyHintLinks(distDir, map) {
  // Only the critical path is hinted. poster-prefs.js blocks rendering so a
  // stored poster choice is on the document before first paint. Hint it
  // ahead of the deferred station shell. Each name is checked against the
  // asset map. A rename or removal in static/ fails the build here, so the
  // hint cannot disappear quietly.
  const EARLY_HINTED = ['poster-prefs.js', 'station.css', 'station.js'];
  const lines = EARLY_HINTED.map((name) => {
    if (!map[name]) {
      throw new Error(`Early Hints allowlist names "${name}" but it is not in the asset map — renamed or removed from static/?`);
    }
    const as = name.endsWith('.css') ? 'style' : 'script';
    return `  Link: </${map[name]}>; rel=preload; as=${as}`;
  }).join('\n');

  const headersPath = path.join(distDir, '_headers');
  let txt = fs.readFileSync(headersPath, 'utf8');
  // Match each HTML-route rule block: the route key (/, /*/, /*.html)
  // followed by both Cache-Control and CDN-Cache-Control lines. Anchor
  // on CDN-Cache-Control so appended Link: lines stay grouped under the
  // edge directive that triggers Early Hints.
  const routeRule = /^(\/(?:\*\/|\*\.html)?\n {2}Cache-Control: [^\n]+\n {2}CDN-Cache-Control: [^\n]+)$/gm;
  txt = txt.replace(routeRule, (block) => `${block}\n${lines}`);
  fs.writeFileSync(headersPath, txt);
}

/**
 * lightningcss has shipped builds that minify `@property` syntax `"<angle>"`
 * to a space — the angle brackets are treated as markup and discarded. An
 * invalid `syntax` drops the whole registration, so `--angle-1` / `--angle-2`
 * never interpolate and the glass rim stops turning. Put the token back if
 * the minifier removed it. A block that already contains `<angle>` is left
 * alone.
 *
 * @param {string} css minified stylesheet
 * @returns {string}
 */
export function preserveAnglePropertySyntax(css) {
  return css.replace(/@property\s+--angle-[12]\{[^}]*\}/g, (block) => {
    if (block.includes('<angle>')) return block;
    return block.replace(/syntax:\s*"[^"]*"/, 'syntax:"<angle>"');
  });
}

const WILDCARD_ASSET_ROUTES = new Set(['/*.css', '/*.js']);

/**
 * Pin immutable caching and a real MIME type to each CSS/JS file that
 * actually exists in `distDir`. Extension wildcards are removed if present
 * and the build fails if one survives.
 *
 * Cloudflare Pages matches `_headers` on the request URL, not the file that
 * was served. `/*.css` therefore attached `max-age=31536000, immutable` to
 * the HTML document Pages returned for a missing hash (SPA fallback, because
 * the project had no top-level `404.html`). Browsers then refused that
 * document as a stylesheet and kept it for a year. Exact filenames never
 * match a hash that is not in this build, so a missing asset cannot inherit
 * the CSS/JS cache policy. `static/404.html` is what turns the fallback
 * into a 404.
 *
 * @param {string} distDir resolved dist root
 * @returns {void}
 */
export function emitImmutableAssetHeaders(distDir) {
  const headersPath = path.join(distDir, '_headers');
  const raw = fs.readFileSync(headersPath, 'utf8');
  const kept = [];
  let skipping = false;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (line.startsWith(' ') || !trimmed || trimmed.startsWith('#')) {
      if (!skipping) kept.push(line);
      continue;
    }
    skipping = WILDCARD_ASSET_ROUTES.has(trimmed);
    if (!skipping) kept.push(line);
  }

  const assets = fs.readdirSync(distDir)
    .filter((name) => name.endsWith('.css') || name.endsWith('.js'))
    .sort();
  if (!assets.length) {
    throw new Error('emitImmutableAssetHeaders: no CSS or JS files in dist to pin.');
  }

  const blocks = assets.map((name) => {
    const type = name.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'text/javascript; charset=utf-8';
    return [
      `/${name}`,
      '  Cache-Control: public, max-age=31536000, immutable',
      '  CDN-Cache-Control: public, max-age=31536000, immutable',
      `  Content-Type: ${type}`,
    ].join('\n');
  });

  const next = `${kept.join('\n').replace(/\s*$/, '\n')
  }\n# Exact content-hashed assets. A missing hash must not match these rules.\n${
    blocks.join('\n\n')}\n`;

  if (/^\/\*\.(?:css|js)$/m.test(next)) {
    throw new Error(
      'Refusing to emit _headers with /*.css or /*.js. Those rules cache the HTML '
      + 'fallback for a missing hash as an immutable stylesheet or script.',
    );
  }
  fs.writeFileSync(headersPath, next);
}
