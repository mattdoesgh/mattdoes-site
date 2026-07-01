// lib/emit/assets.js — file plumbing + static-asset minify/hash for Emit.
//
// Owns everything that moves bytes into dist/ without rendering them: page
// writes, static-tree copies, the timeline-controls client bundle, the
// minify + content-hash pipeline for CSS/JS, and the Early Hints Link
// headers derived from the hashed filenames.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { transform as cssTransform } from 'lightningcss';
import { minify as jsMinify } from 'terser';

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

export function copyTimelineControlsBundle(distDir) {
  const clientDir = path.join(REPO_ROOT, 'design-system', 'dist-client');
  if (!fs.existsSync(clientDir)) {
    throw new Error('Missing design-system/dist-client. Run npm run build:ssg before building the site.');
  }
  const files = fs.readdirSync(clientDir).filter((name) => name.endsWith('.js'));
  const entry = files.find((name) => /^timeline-controls\.[\w-]+\.js$/.test(name));
  if (!entry) {
    throw new Error('Missing timeline-controls client entry in design-system/dist-client.');
  }
  for (const name of files) {
    fs.copyFileSync(path.join(clientDir, name), path.join(distDir, name));
  }
  return ['timeline-controls.js', entry];
}

// ── asset minify + content hash ──────────────────────────────────────────
/**
 * 8-hex-char content hash (truncated SHA-256). Used to fingerprint CSS/JS
 * filenames for immutable caching — collisions at 32 bits are effectively
 * impossible for the ~10 assets this site ships.
 *
 * @param {Buffer|string} buf
 * @returns {string} 8-char hex string
 */
function hash8(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
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
    const { code } = cssTransform({
      filename,
      code: input,
      minify: true,
      sourceMap: false,
    });
    output = Buffer.from(code);
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
  const css    = map['_shared.css'];
  const boot   = map['theme-boot.js'];
  const tweaks = map['tweaks.js'];
  const nav    = map['nav-prefetch.js'];
  const lines = [
    css    && `  Link: </${css}>; rel=preload; as=style`,
    // theme-boot is the one render-blocking script (it must run before paint);
    // hint it ahead of the deferred shell scripts so it lands first.
    boot   && `  Link: </${boot}>; rel=preload; as=script`,
    tweaks && `  Link: </${tweaks}>; rel=preload; as=script`,
    nav    && `  Link: </${nav}>; rel=preload; as=script`,
  ].filter(Boolean).join('\n');
  if (!lines) return;

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
