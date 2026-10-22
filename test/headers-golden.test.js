// Golden regression for emitted dist/_headers — security directives, cache
// tiers, and Early Hints preloads appended by emitEarlyHintLinks().

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixtureVault, readDist } from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';

const HTML_ROUTES = ['/', '/*/', '/*.html'];
const EARLY_HINT_ASSETS = [
  { stem: 'station.', as: 'style' },
  { stem: 'station.', as: 'script' },
];

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
    "script-src 'self' https://static.cloudflareinsights.com 'inline-speculation-rules'",
    "connect-src 'self' https://cloudflareinsights.com",
    "script-src-attr 'none'",
    "worker-src 'none'",
    "style-src-attr 'none'",
    "frame-ancestors 'none'",
    "frame-src https://embed.music.apple.com",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ]) {
    assert.match(csp, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `CSP must include ${token}`);
  }
  assert.doesNotMatch(csp, /bandcamp/i, 'an unset Bandcamp URL must not widen frame-src');

  const hsts = headerValues(routes, '/*', 'strict-transport-security')[0];
  assert.match(hsts, /max-age=31536000/, 'HSTS must be set with a one-year max-age');
  assert.match(hsts, /includeSubDomains/, 'HSTS must include subdomains');

  assert.equal(headerValues(routes, '/*', 'x-content-type-options')[0], 'nosniff');
  assert.equal(headerValues(routes, '/*', 'x-frame-options')[0], 'DENY');
  assert.equal(headerValues(routes, '/*', 'cross-origin-opener-policy')[0], 'same-origin');
  assert.equal(headerValues(routes, '/*', 'cross-origin-resource-policy')[0], 'same-origin');
  assert.equal(headerValues(routes, '/*', 'origin-agent-cluster')[0], '?1');
  assert.equal(headerValues(routes, '/*', 'cross-origin-embedder-policy').length, 0,
    'COEP require-corp would block media.mattdoes.online posters and the analytics beacon');
  const permissions = headerValues(routes, '/*', 'permissions-policy')[0];
  assert.match(permissions, /geolocation=\(\)/);
  assert.doesNotMatch(permissions, /geolocation=\(self\)/);
  assert.match(
    headerValues(routes, '/*', 'referrer-policy')[0],
    /strict-origin-when-cross-origin/,
  );
});

test('same-origin SVGs under /img are served as attachments', () => {
  assert.equal(headerValues(routes, '/img/*.svg', 'content-disposition')[0], 'attachment');
  assert.equal(headerValues(routes, '/img/*.svg', 'x-content-type-options')[0], 'nosniff');
  const source = fs.readFileSync(path.join(process.cwd(), 'static', '_headers'), 'utf8');
  assert.match(source, /^\/img\/\*\.svg$/m);
});

test('report-only CSP points at the same-origin report collector', () => {
  const reportOnly = headerValues(routes, '/*', 'content-security-policy-report-only')[0];
  assert.ok(reportOnly, '/* must set Content-Security-Policy-Report-Only');
  assert.match(reportOnly, /report-uri https:\/\/mattdoes\.online\/api\/csp-report/,
    'report-only CSP must target the csp-report Worker');
  assert.match(reportOnly, /frame-src https:\/\/embed\.music\.apple\.com(?! https:\/\/bandcamp\.com)/,
    'report-only frame-src must match the enforced player allowlist');
  assert.doesNotMatch(reportOnly, /bandcamp/i, 'an unset Bandcamp URL must not widen frame-src');
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
  assert.match(notFound, /<h1 class="sign"><a href="\/">not found<\/a><\/h1>/);
  assert.match(notFound, /<main id="main">/);
  assert.doesNotMatch(notFound, /<h1 class="ident">/,
    'the 404 page must not be the homepage');

  const station = fs.readdirSync(distDir).find((name) => /^station\.[0-9a-f]{8}\.css$/.test(name));
  assert.ok(station, 'hashed station stylesheet must exist');
  const css = fs.readFileSync(path.join(distDir, station), 'utf8');
  assert.doesNotMatch(css, /linear-gradient|background-image/);
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
    assert.ok(links.length >= 2, `${route} must append Early Hint Link preloads`);

    for (const asset of EARLY_HINT_ASSETS) {
      const preload = links.find((l) => l.includes('rel=preload') && l.includes(`as=${asset.as}`) && l.includes(asset.stem));
      assert.ok(preload, `${route} must preload the hashed station ${asset.as}`);
      const match = preload.match(/<\/([^>]+)>/);
      assert.ok(match, `preload link must name a path: ${preload}`);
      assert.ok(distFiles.has(match[1]),
        `preloaded asset ${match[1]} must exist in dist`);
    }
  }
});
