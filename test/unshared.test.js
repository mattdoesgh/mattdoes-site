// Unshared copy is fixed. The Bandcamp player is optional and typed.
// An unset URL emits no Bandcamp markup.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';
import { unsharedPlayer } from '../site/verbs.ts';
import { bandcampSlot } from '../site/render.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('no Bandcamp markup is emitted when the optional URL is unset', () => {
  assert.equal(unsharedPlayer.bandcamp, undefined);
  assert.equal(bandcampSlot(unsharedPlayer.bandcamp), '');
  assert.equal(bandcampSlot(''), '');
  assert.equal(bandcampSlot('https://example.com/bandcamp'), '');

  const html = readDist(distDir, 'unshared/index.html');
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('p.lede')?.textContent, 'Fun is unshared');
  assert.equal(html.includes('TODO'), false);
  assert.equal(doc.querySelector('iframe'), null);
  assert.equal(doc.querySelector('.players, .slot'), null);
  assert.equal(doc.querySelector('a[href*="bandcamp" i]'), null);
  assert.doesNotMatch(html, /bandcamp/i);

  const routes = parseHeadersFile(readDist(distDir, '_headers'));
  for (const name of ['content-security-policy', 'content-security-policy-report-only']) {
    assert.doesNotMatch(headerValues(routes, '/*', name)[0], /bandcamp/i);
  }
});

test('a configured Bandcamp URL renders the player slot', () => {
  const html = bandcampSlot('https://artist.bandcamp.com/album/name');
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const frame = doc.querySelector('iframe');
  assert.ok(frame);
  assert.equal(frame.getAttribute('src'), 'https://artist.bandcamp.com/album/name');
  assert.ok(doc.querySelector('.slot'));
  assert.equal(bandcampSlot('http://artist.bandcamp.com/album/name'), '');
});
