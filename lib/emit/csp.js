// lib/emit/csp.js — page CSP for Emit.
//
// The strict CSP carries no 'unsafe-inline'. applyPageCsp writes both
// headers from lib/csp-policy.js. injectInlineScriptCsp appends sha256
// sources when the caller passes inline script bodies.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { contentSecurityPolicy, CSP_REPORT_URI } from '../csp-policy.js';

/**
 * Replace the two CSP marker lines in the dist `_headers` copy with the
 * policy from lib/csp-policy.js. Both the enforced header and the
 * report-only twin come from that one list.
 *
 * @param {string} distDir resolved dist root
 * @returns {void}
 */
export function applyPageCsp(distDir) {
  const headersPath = path.join(distDir, '_headers');
  const enforcedLine = `  Content-Security-Policy: ${contentSecurityPolicy()}`;
  const reportLine = `  Content-Security-Policy-Report-Only: ${contentSecurityPolicy({ reportUri: CSP_REPORT_URI })}`;
  for (const line of [enforcedLine, reportLine]) {
    if (line.length > 2000) {
      throw new Error(`CSP header line is ${line.length} characters; Pages rejects lines over 2000`);
    }
  }
  const txt = fs.readFileSync(headersPath, 'utf8');
  let enforcedHits = 0;
  let reportHits = 0;
  const next = txt.split('\n').map((line) => {
    if (/^ {2}Content-Security-Policy:/.test(line)) {
      enforcedHits += 1;
      return enforcedLine;
    }
    if (/^ {2}Content-Security-Policy-Report-Only:/.test(line)) {
      reportHits += 1;
      return reportLine;
    }
    return line;
  }).join('\n');
  if (enforcedHits !== 1 || reportHits !== 1) {
    throw new Error(
      `applyPageCsp: ${headersPath} needs exactly one Content-Security-Policy marker `
      + 'and one Content-Security-Policy-Report-Only marker',
    );
  }
  fs.writeFileSync(headersPath, next);
}

/**
 * Append sha256 sources for inline script bodies to every script-src.
 * A hash source disables `'inline-speculation-rules'`, so those bodies have
 * to be hashed together with that keyword's scripts. An empty list leaves
 * script-src unchanged.
 *
 * @param {string} distDir resolved dist root
 * @param {string[]} inlineScripts exact inline `<script>` bodies
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
  // Fail loud if the anchor did not match. A CSP that drops an inline
  // script fails here, at build time. `npm run build` does not run the
  // test that would otherwise catch a script-src edit.
  const enforced = txt.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
  if (!enforced || !hashes.every((h) => enforced.includes(h))) {
    throw new Error(
      `injectInlineScriptCsp: ${headersPath} script-src did not receive every inline-script `
      + `hash (${hashes.join(' ')}) — the strict CSP would drop an inline script. `
      + "Check script-src in lib/csp-policy.js. It must keep the 'inline-speculation-rules' source.",
    );
  }
  fs.writeFileSync(headersPath, txt);
}
