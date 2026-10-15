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
    "frame-src https://embed.music.apple.com https://bandcamp.com",
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
  assert.match(reportOnly, /frame-src https:\/\/embed\.music\.apple\.com https:\/\/bandcamp\.com/,
    'report-only frame-src must match the enforced player allowlist');
});

test('hashed JS and CSS assets are immutable for one year', () => {
  const cc = headerValues(routes, '/fonts/*', 'cache-control')[0];
  assert.match(cc, /max-age=31536000/, '/fonts/* must cache for one year');
  assert.match(cc, /immutable/, '/fonts/* must be marked immutable');

  const source = fs.readFileSync(path.join(process.cwd(), 'static', '_headers'), 'utf8');
  assert.doesNotMatch(source, /^\/\*\.css$/m, 'static/_headers must not wildcard CSS');
  assert.doesNotMatch(source, /^\/\*\.js$/m, 'static/_headers must not wildcard JS');
  assert.equal(routes.has('/*.css'), false, 'dist _headers must not wildcard CSS');
  assert.equal(routes.has('/*.js'), false, 'dist _headers must not wildcard JS');

  const assets = fs.readdirSync(distDir).filter((name) => name.endsWith('.css') || name.endsWith('.js'));
  assert.ok(assets.length > 0, 'dist must contain hashed CSS and JS');
  for (const name of assets) {
    const cache = headerValues(routes, `/${name}`, 'cache-control')[0];
    assert.match(cache, /max-age=31536000/, `/${name} must cache for one year`);
    assert.match(cache, /immutable/, `/${name} must be marked immutable`);
    const type = headerValues(routes, `/${name}`, 'content-type')[0];
    if (name.endsWith('.css')) {
      assert.match(type, /^text\/css/, `/${name} must be served as text/css`);
    } else {
      assert.match(type, /javascript/, `/${name} must be served as javascript`);
    }
  }
});

test('a missing hashed asset cannot fall through to the HTML shell', () => {
  // Cloudflare Pages serves /index.html with 200 for unknown paths when the
  // project has no top-level 404.html, and _headers then stamps the /*.css
  // immutable policy onto that HTML. After deploy:
  //   curl -sI https://mattdoes.online/_shared.DOESNOTEXIST.css
  // must be HTTP 404, content-type must not be a stylesheet, and the
  // response must not include "immutable".
  const notFound = fs.readFileSync(path.join(distDir, '404.html'), 'utf8');
  assert.match(notFound, /<h1>Not found<\/h1>/);
  assert.match(notFound, /<main id="main">/);
  assert.doesNotMatch(notFound, /site-field|class="topbar"/,
    'the 404 page must not be the homepage shell');

  const shared = fs.readdirSync(distDir).find((name) => /^_shared\.[0-9a-f]{8}\.css$/.test(name));
  assert.ok(shared, 'hashed shared stylesheet must exist');
  assert.notEqual(shared, '_shared.48d881a1.css',
    'the poisoned immutable filename must not ship again');
  const css = fs.readFileSync(path.join(distDir, shared), 'utf8');
  assert.match(css, /--css-rev:"2026-10-15-asset-404"/);
  assert.match(css, /syntax:"<angle>"/);
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
