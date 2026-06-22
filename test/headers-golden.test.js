// Golden regression for emitted dist/_headers — security directives, cache
// tiers, and Early Hints preloads appended by emitEarlyHintLinks().

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixtureVault, readDist } from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';

const HTML_ROUTES = ['/', '/*/', '/*.html'];
const EARLY_HINT_ASSETS = ['_shared', 'theme-boot', 'tweaks', 'nav-prefetch'];

let distDir;
let routes;

test.before(() => {
  ({ distDir } = buildFixtureVault());
  routes = parseHeadersFile(readDist(distDir, '_headers'));
});

test('global security headers include CSP, HSTS, and framing controls', () => {
  const csp = headerValues(routes, '/*', 'content-security-policy')[0];
  assert.ok(csp, '/* must set Content-Security-Policy');
  for (const token of [
    "default-src 'self'",
    "script-src 'self' 'inline-speculation-rules'",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ]) {
    assert.match(csp, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `CSP must include ${token}`);
  }

  const hsts = headerValues(routes, '/*', 'strict-transport-security')[0];
  assert.match(hsts, /max-age=31536000/, 'HSTS must be set with a one-year max-age');
  assert.match(hsts, /includeSubDomains/, 'HSTS must include subdomains');

  assert.equal(headerValues(routes, '/*', 'x-content-type-options')[0], 'nosniff');
  assert.equal(headerValues(routes, '/*', 'x-frame-options')[0], 'SAMEORIGIN');
  assert.match(
    headerValues(routes, '/*', 'referrer-policy')[0],
    /strict-origin-when-cross-origin/,
  );
});

test('report-only CSP points at the same-origin report collector', () => {
  const reportOnly = headerValues(routes, '/*', 'content-security-policy-report-only')[0];
  assert.ok(reportOnly, '/* must set Content-Security-Policy-Report-Only');
  assert.match(reportOnly, /report-uri https:\/\/mattdoes\.online\/api\/csp-report/,
    'report-only CSP must target the csp-report Worker');
});

test('hashed JS and CSS assets are immutable for one year', () => {
  for (const pattern of ['/*.js', '/*.css', '/fonts/*']) {
    const cc = headerValues(routes, pattern, 'cache-control')[0];
    assert.match(cc, /max-age=31536000/, `${pattern} must cache for one year`);
    assert.match(cc, /immutable/, `${pattern} must be marked immutable`);
  }
});

test('HTML routes carry edge cache policy and Early Hint preloads', () => {
  const distFiles = new Set(fs.readdirSync(distDir));

  for (const route of HTML_ROUTES) {
    const cc = headerValues(routes, route, 'cache-control')[0];
    assert.match(cc, /max-age=0/, `${route} must revalidate in the browser`);
    assert.match(cc, /must-revalidate/, `${route} must require revalidation`);

    const edge = headerValues(routes, route, 'cdn-cache-control')[0];
    assert.match(edge, /s-maxage=21600/, `${route} must set a 6h edge TTL`);

    const links = headerValues(routes, route, 'link');
    assert.ok(links.length >= 4, `${route} must append Early Hint Link preloads`);

    for (const stem of EARLY_HINT_ASSETS) {
      const preload = links.find(l => l.includes(`rel=preload`) && l.includes(stem));
      assert.ok(preload, `${route} must preload the hashed ${stem} asset`);
      const match = preload.match(/<\/([^>]+)>/);
      assert.ok(match, `preload link must name a path: ${preload}`);
      assert.ok(distFiles.has(match[1]),
        `preloaded asset ${match[1]} must exist in dist`);
    }
  }
});
