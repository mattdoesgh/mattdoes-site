// CSP allowlist and single-header behaviour.
//
// Pages applies every _headers rule that matches a URL, and a header set by
// two of those rules is joined with a comma. Browsers enforce each
// Content-Security-Policy separately, so a joined or repeated policy is a
// second header. The enforced policy is declared once, on /*, and nowhere else.
//
// script-src 'self' is what admits the same-origin Email Obfuscation decoder
// (/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js). A host
// source cannot name that path, and no Worker route or Pages function may
// take /cdn-cgi/* away from Cloudflare.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';

const BEACON_SCRIPT = 'https://static.cloudflareinsights.com';
const BEACON_CONNECT = 'https://cloudflareinsights.com';
const EMAIL_DECODE = '/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js';

const SAMPLE_PATHS = [
  '/',
  '/watch/',
  '/listen/',
  '/unshared/',
  '/frequency/',
  '/404.html',
  '/fonts/Anton-latin.woff2',
  '/station.00000000.css',
  EMAIL_DECODE,
  '/cdn-cgi/l/email-protection',
];

/** Cloudflare _headers splat: one `*` matches across slashes. */
function matches(pattern, pathname) {
  const body = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}$`).test(pathname);
}

function enforcedLines(text) {
  return text.split('\n').filter((line) => /^\s*Content-Security-Policy:/.test(line));
}

function reportOnlyLines(text) {
  return text.split('\n').filter((line) => /^\s*Content-Security-Policy-Report-Only:/.test(line));
}

function sources(csp, name) {
  const directive = csp.split(';').map((part) => part.trim()).find((part) => part === name || part.startsWith(`${name} `));
  assert.ok(directive, `missing ${name} in ${csp}`);
  return directive.slice(name.length).trim().split(/\s+/).filter(Boolean);
}

let distDir;
let routes;
let distHeaders;

test.before(() => {
  ({ distDir } = buildFixtureVault());
  distHeaders = readDist(distDir, '_headers');
  routes = parseHeadersFile(distHeaders);
});

test('static and emitted _headers declare exactly one enforced CSP', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'static', '_headers'), 'utf8');
  assert.equal(enforcedLines(source).length, 1, 'static/_headers must declare Content-Security-Policy once');
  assert.equal(reportOnlyLines(source).length, 1, 'static/_headers must declare the report-only twin once');
  assert.equal(enforcedLines(distHeaders).length, 1, 'dist/_headers must still declare Content-Security-Policy once');
  assert.equal(reportOnlyLines(distHeaders).length, 1, 'dist/_headers must still declare the report-only twin once');

  for (const line of distHeaders.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    assert.ok(line.length <= 2000, `Pages rejects _headers lines over 2000 characters (${line.length})`);
  }
});

test('a URL inherits one enforced CSP and one report-only CSP', () => {
  for (const pathname of SAMPLE_PATHS) {
    /** @type {string[]} */
    const enforced = [];
    /** @type {string[]} */
    const reportOnly = [];
    for (const [pattern, headers] of routes) {
      if (!matches(pattern, pathname)) continue;
      enforced.push(...(headers.get('content-security-policy') || []));
      reportOnly.push(...(headers.get('content-security-policy-report-only') || []));
    }
    assert.equal(enforced.length, 1, `${pathname} would send ${enforced.length} Content-Security-Policy headers`);
    assert.equal(reportOnly.length, 1, `${pathname} would send ${reportOnly.length} report-only CSP headers`);
  }

  for (const [pattern] of routes) {
    if (pattern === '/*') continue;
    assert.equal(headerValues(routes, pattern, 'content-security-policy').length, 0,
      `${pattern} must not set Content-Security-Policy; /* already does`);
    assert.equal(headerValues(routes, pattern, 'content-security-policy-report-only').length, 0,
      `${pattern} must not set a report-only CSP`);
  }
});

test('beacon hosts are allowed and the rest of the policy stays strict', () => {
  for (const header of ['content-security-policy', 'content-security-policy-report-only']) {
    const csp = headerValues(routes, '/*', header)[0];
    const scriptSrc = sources(csp, 'script-src');
    const hashes = scriptSrc.filter((token) => token.startsWith("'sha256-"));
    const plain = scriptSrc.filter((token) => !token.startsWith("'sha256-"));
    assert.deepEqual(plain, ["'self'", BEACON_SCRIPT, "'inline-speculation-rules'"],
      `${header} script-src hosts drifted`);
    assert.equal(hashes.length, 0, `${header} has no inline scripts, so script-src carries no hashes`);
    assert.deepEqual(sources(csp, 'connect-src'), ["'self'", BEACON_CONNECT]);
    assert.match(sources(csp, 'default-src').join(' '), /^'self'$/);
    assert.equal(sources(csp, 'style-src').join(' '), "'self'");
    assert.equal(sources(csp, 'object-src').join(' '), "'none'");
    assert.ok(!csp.includes("'unsafe-inline'"), `${header} must not allow unsafe-inline`);
    assert.ok(!csp.includes("'unsafe-eval'"), `${header} must not allow unsafe-eval`);
  }

  const enforced = headerValues(routes, '/*', 'content-security-policy')[0];
  const reportOnly = headerValues(routes, '/*', 'content-security-policy-report-only')[0];
  assert.ok(!enforced.includes('report-uri'), 'the enforced CSP must not add a report endpoint');
  assert.match(reportOnly, /report-uri https:\/\/mattdoes\.online\/api\/csp-report$/);
  assert.ok(sources(enforced, 'script-src').includes("'self'"),
    `script-src 'self' must keep admitting ${EMAIL_DECODE}`);
});

test('no Worker route or Pages function intercepts /cdn-cgi', () => {
  const workersDir = path.join(REPO_ROOT, 'workers');
  const tomls = fs.readdirSync(workersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(workersDir, entry.name, 'wrangler.toml'))
    .filter((file) => fs.existsSync(file));
  assert.ok(tomls.length >= 4, 'expected the listening, geo, csp-report, and rebuild configs');

  for (const file of tomls) {
    const text = fs.readFileSync(file, 'utf8');
    const patterns = [...text.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
    for (const pattern of patterns) {
      assert.doesNotMatch(pattern, /cdn-cgi/, `${pattern} would take Cloudflare's /cdn-cgi paths`);
      const slash = pattern.indexOf('/');
      const routePath = slash === -1 ? '/' : pattern.slice(slash).replace(/\*.*$/, '');
      assert.ok(routePath.startsWith('/api/'),
        `${pattern} is not confined to /api/; a broader route would intercept ${EMAIL_DECODE}`);
    }
    assert.doesNotMatch(text, /['"]content-security-policy/i,
      `${path.relative(REPO_ROOT, file)} must not set a second CSP header`);
    const srcDir = path.join(path.dirname(file), 'src');
    if (!fs.existsSync(srcDir)) continue;
    for (const name of fs.readdirSync(srcDir)) {
      if (!name.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(srcDir, name), 'utf8');
      assert.doesNotMatch(src, /['"]content-security-policy/i,
        `${path.relative(REPO_ROOT, path.join(srcDir, name))} must not set a second CSP header`);
    }
  }

  const sharedLib = path.join(workersDir, 'lib');
  for (const name of fs.readdirSync(sharedLib)) {
    if (!name.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(sharedLib, name), 'utf8');
    assert.doesNotMatch(src, /['"]content-security-policy/i,
      `workers/lib/${name} must not set a second CSP header`);
  }

  for (const rel of ['functions', '_worker.js', 'static/_worker.js', 'public/_worker.js']) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, rel)), false,
      `${rel} would intercept /cdn-cgi before Cloudflare's email decoder`);
  }

  const redirects = fs.readFileSync(path.join(REPO_ROOT, 'static', '_redirects'), 'utf8');
  assert.doesNotMatch(redirects, /cdn-cgi/);
});
