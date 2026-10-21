// Unshared copy is fixed. The Bandcamp player is optional and typed.
// An unset URL emits no Bandcamp markup.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';
import fs from 'node:fs';
import path from 'node:path';
import { unsharedPlayer, unsharedContact, unsharedEnabled } from '../site/verbs.ts';
import { bandcampSlot, contactBlock, renderFrequency, renderUnshared } from '../site/render.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('no Bandcamp markup is emitted when the optional URL is unset', () => {
  assert.equal(unsharedPlayer.bandcamp, undefined);
  assert.equal(bandcampSlot(unsharedPlayer.bandcamp), '');
  assert.equal(bandcampSlot(''), '');
  assert.equal(bandcampSlot('https://example.com/bandcamp'), '');

  assert.equal(fs.existsSync(path.join(distDir, 'unshared', 'index.html')), false);

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

test('the unshared contact mailto stays in source and out of the build', () => {
  const address = 'luciadoes+unshared@mail.grokbot.com';
  assert.equal(unsharedEnabled, false);
  assert.equal(unsharedContact.email, address);
  assert.equal(contactBlock('not-an-email'), '');
  assert.equal(fs.existsSync(path.join(distDir, 'unshared', 'index.html')), false);

  const html = renderUnshared({
    siteUrl: 'https://mattdoes.online',
    assets: { 'station.css': 'station.css', 'station.js': 'station.js' },
  });
  const doc = new JSDOM(html).window.document;
  const links = [...doc.querySelectorAll('.outlinks a')];
  const link = links.find((anchor) => anchor.textContent === 'email');
  assert.equal(doc.querySelector('p.lede')?.textContent, 'Fun is unshared');
  assert.equal(link?.getAttribute('href'), `mailto:${address}`);
  assert.equal(link?.textContent, 'email');
  assert.equal(link?.getAttribute('aria-label'), 'email unshared');

  for (const file of walkFiles(distDir)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(distDir, file);
    assert.equal(text.includes('unshared@mattdoes.online'), false, rel);
    assert.equal(text.includes('luciadoes+unshared@'), false, rel);
    assert.equal(text.includes('/unshared/'), false, rel);
  }
});

test('the frequency page source still renders the prize mailto', () => {
  const html = renderFrequency({
    siteUrl: 'https://mattdoes.online',
    assets: { 'station.css': 'station.css', 'station.js': 'station.js' },
  });
  assert.match(html, /href="mailto:luciadoes@mail\.grokbot\.com"/);
  assert.match(html, /name="robots" content="noindex"/);
});

test('a configured email renders the contact mailto', () => {
  const html = contactBlock('person@example.com');
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  assert.equal(doc.querySelector('h2')?.textContent, 'Contact');
  assert.equal(doc.querySelector('a')?.getAttribute('href'), 'mailto:person@example.com');
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
