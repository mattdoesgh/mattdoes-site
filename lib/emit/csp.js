// lib/emit/csp.js — inline-script CSP hashing for Emit.
//
// The strict CSP carries no 'unsafe-inline'; every inline <head> script the
// document shell emits is admitted by a per-build sha256 appended to the
// dist _headers here (ADR 0001/0007).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Admit every site-controlled inline `<head>` script under the strict CSP.
 * `script-src` carries no `'unsafe-inline'`, and — critically — a hash source
 * in a directive *disables* its keyword inline allowances, `'inline-speculation
 * -rules'` included. So the moment the importmap is hashed, the speculation
 * rules stop being admitted by their keyword and must be hashed too; the two
 * inline scripts the document shell emits (importmap + speculation rules) are
 * therefore hashed together. Drop either and the browser silently blocks it —
 * a dropped importmap kills every module that imports through it
 * (listening-live.js → `./rows.js` → 404 HTML → MIME failure → no live
 * updates); dropped speculation rules kill prerender/prefetch (ADR 0007).
 *
 * Mirrors emitEarlyHintLinks: post-processes the dist `_headers` copy (never the
 * `static/` source) so each build starts fresh. The importmap's bytes move with
 * the hashed rows.js/_helpers.js URLs, so the caller derives `inlineScripts`
 * from the same build*() helpers the document emits, never hardcoded in static/.
 *
 * @param {string} distDir resolved dist root
 * @param {string[]} inlineScripts the exact inline <script> bodies the document
 *   shell emits (importmap + speculation rules — see the index.js call site)
 * @returns {void}
 */
export function injectInlineScriptCsp(distDir, inlineScripts) {
  const hashes = inlineScripts.map(
    (s) => `'sha256-${crypto.createHash('sha256').update(s).digest('base64')}'`,
  );
  const headersPath = path.join(distDir, '_headers');
  let txt = fs.readFileSync(headersPath, 'utf8');
  // Append all hashes to every script-src directive (the enforced CSP and its
  // report-only twin), right after the inline-speculation-rules source.
  // Idempotent: leave a directive untouched once it carries every hash.
  txt = txt.replace(/script-src [^;]*?'inline-speculation-rules'/g, (directive) =>
    hashes.every((h) => directive.includes(h)) ? directive : `${directive} ${hashes.join(' ')}`);
  // Fail loud if the anchor didn't match. Shipping a CSP that still drops an
  // inline script is the exact silent regression this mechanism exists to
  // prevent, and `npm run build` (the deploy path) skips the test that would
  // otherwise catch it — so anchor drift (a future script-src edit) must surface
  // here, at build time, not as dead live-updates / dead prerender in prod.
  const enforced = txt.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  if (!enforced || !hashes.every((h) => enforced.includes(h))) {
    throw new Error(
      `injectInlineScriptCsp: ${headersPath} script-src did not receive every inline-script `
      + `hash (${hashes.join(' ')}) — the strict CSP would drop an inline script. `
      + 'Check the script-src anchor against static/_headers.',
    );
  }
  fs.writeFileSync(headersPath, txt);
}
