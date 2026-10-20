// Unshared copy is fixed. The Bandcamp player is optional and typed.
// An unset URL emits no Bandcamp markup.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';
import fs from 'node:fs';
import path from 'node:path';
import { unsharedPlayer, unsharedContact } from '../site/verbs.ts';
import { bandcampSlot, contactBlock } from '../site/render.js';

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

function walkFiles(dir) {
  const files = [];
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) files.push(...walkFiles(file));
    else files.push(file);
  }
  return files;
}

test('unshared@mattdoes.online is not emitted while the contact is unset', () => {
  assert.equal(unsharedContact.email, undefined);
  assert.equal(contactBlock(unsharedContact.email), '');
  assert.equal(contactBlock('not-an-email'), '');

  for (const file of walkFiles(distDir)) {
    const text = fs.readFileSync(file);
    const rel = path.relative(distDir, file);
    assert.equal(text.includes('unshared@mattdoes.online'), false, rel);
    if (!file.endsWith('.html')) continue;
    const doc = new JSDOM(text.toString('utf8')).window.document;
    const headings = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    assert.equal(headings.some((node) => node.textContent.trim().toLowerCase() === 'contact'), false, rel);
  }

  const html = readDist(distDir, 'unshared/index.html');
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('.contact'), null);
  assert.equal(doc.querySelector('a[href^="mailto:unshared@"]'), null);

  const frequency = readDist(distDir, 'frequency/index.html');
  assert.match(frequency, /href="mailto:luciadoes@mail\.grokbot\.com"/);
});

test('a configured email renders the contact mailto', () => {
  const html = contactBlock('unshared@mattdoes.online');
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  assert.equal(doc.querySelector('h2')?.textContent, 'Contact');
  assert.equal(doc.querySelector('a')?.getAttribute('href'), 'mailto:unshared@mattdoes.online');
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
