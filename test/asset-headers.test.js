// Missing hashed assets must not be cacheable HTML.
//
// Pages matches `_headers` on the request URL. A `/*.css` rule would attach
// `immutable` to the HTML document served for a hash that does not exist.
// curl -sI https://mattdoes.online/_shared.DOESNOTEXIST.css must be 404 and
// must not include "immutable". These tests lock the build rules that make
// that response possible: exact filenames only, plus a non-shell 404.html.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emitImmutableAssetHeaders, preserveAnglePropertySyntax, processAsset } from '../lib/emit/assets.js';

test('a mangled @property angle syntax is restored before the stylesheet is hashed', async () => {
  const broken = '@property --angle-1{syntax:" ";inherits:false;initial-value:-75deg}@property --angle-2{syntax:" ";inherits:false;initial-value:-45deg}';
  const fixed = preserveAnglePropertySyntax(broken);
  assert.equal(fixed.includes('syntax:" "'), false);
  assert.equal(fixed.match(/syntax:"<angle>"/g)?.length, 2);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdo-css-'));
  fs.writeFileSync(path.join(dir, 'sample.css'), '@property --angle-1 { syntax: "<angle>"; inherits: false; initial-value: -75deg; }\n');
  const [, hashed] = await processAsset(dir, 'sample.css', 'css');
  const css = fs.readFileSync(path.join(dir, hashed), 'utf8');
  assert.match(css, /syntax:"<angle>"/);
});

test('immutable cache headers are pinned to real CSS and JS files only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdo-headers-'));
  fs.writeFileSync(path.join(dir, '_headers'), [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '',
    '/*.css',
    '  Cache-Control: public, max-age=31536000, immutable',
    '  CDN-Cache-Control: public, max-age=31536000, immutable',
    '',
    '/*.js',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/fonts/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, '_shared.abc12345.css'), 'html{color:#000}');
  fs.writeFileSync(path.join(dir, 'theme-boot.abc12345.js'), '/* ok */');
  fs.writeFileSync(path.join(dir, '404.html'), '<h1>Not found</h1>');

  emitImmutableAssetHeaders(dir);
  const headers = fs.readFileSync(path.join(dir, '_headers'), 'utf8');
  assert.doesNotMatch(headers, /^\/\*\.css$/m);
  assert.doesNotMatch(headers, /^\/\*\.js$/m);
  assert.match(headers, /^\/fonts\/\*$/m);
  assert.match(headers, /^\/_shared\.abc12345\.css$/m);
  assert.match(headers, /^\/theme-boot\.abc12345\.js$/m);
  const cssBlock = headers.split('/_shared.abc12345.css')[1].split('\n/')[0];
  assert.match(cssBlock, /Content-Type: text\/css/);
  assert.match(cssBlock, /immutable/);
  const jsBlock = headers.split('/theme-boot.abc12345.js')[1];
  assert.match(jsBlock, /Content-Type: text\/javascript/);
  assert.doesNotMatch(headers, /404\.html/);
});
