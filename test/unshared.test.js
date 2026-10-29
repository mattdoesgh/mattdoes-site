// Unshared copy is fixed. The Bandcamp player is optional and typed.
// An unset URL emits no Bandcamp markup.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';
import { parseHeadersFile, headerValues } from './helpers/parse-headers.js';
import fs from 'node:fs';
import path from 'node:path';
import { unsharedPlayer, unsharedContact, unsharedEnabled, unsharedProfiles, validateSocials } from '../site/verbs.ts';
import { bandcampSlot, contactBlock, renderFrequency, renderUnshared } from '../site/render.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('no Bandcamp markup is emitted when the optional URL is unset', () => {
  assert.equal(unsharedPlayer.bandcamp, undefined);
  assert.equal(bandcampSlot(unsharedPlayer.bandcamp), '');
  assert.equal(bandcampSlot(''), '');
  assert.equal(bandcampSlot('https://example.com/bandcamp'), '');

  assert.equal(fs.existsSync(path.join(distDir, 'unshared', 'index.html')), true);
  const built = fs.readFileSync(path.join(distDir, 'unshared', 'index.html'), 'utf8');
  assert.equal(built.includes('bandcamp'), false);
  assert.equal(built.includes('<iframe'), false);

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

test('unshared has no contact mailto and the hub is the built page', () => {
  assert.equal(unsharedEnabled, true);
  assert.equal(unsharedContact.email, undefined);
  assert.equal(contactBlock('not-an-email'), '');

  const html = renderUnshared({ siteUrl: 'https://mattdoes.online' });
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('h1')?.textContent, 'matt does unshared');
  assert.equal(doc.querySelector('.outlinks'), null);
  assert.equal(doc.querySelector('p.lede'), null);
  assert.equal(html.includes('mailto:'), false);
  assert.equal(html.includes('Fun is unshared'), false);
  assert.deepEqual(unsharedProfiles.map((item) => ({ label: item.label, href: item.href })), [
    { label: 'suno', href: 'https://suno.com/@unshared' },
  ]);
  assert.doesNotThrow(() => validateSocials(unsharedProfiles));
  const suno = doc.querySelector('a.profile');
  assert.equal(suno?.textContent, 'suno');
  assert.equal(suno?.getAttribute('href'), 'https://suno.com/@unshared');
  assert.equal(suno?.getAttribute('rel'), 'me noopener');
  assert.equal(suno?.getAttribute('target'), null);
  assert.ok(html.indexOf('</h1>') < html.indexOf('https://suno.com/@unshared'));
  assert.ok(html.indexOf('https://suno.com/@unshared') < html.indexOf('aria-label="unshared"'));

  const birds = fs.readFileSync(path.join(distDir, 'unshared', 'birds1', 'index.html'), 'utf8');
  const birdsDoc = new JSDOM(birds).window.document;
  assert.equal(birdsDoc.querySelector('h1')?.textContent, 'birds1');
  assert.equal(birdsDoc.querySelector('a.home')?.textContent, 'matt does');
  assert.equal(birdsDoc.querySelector('a.home')?.getAttribute('href'), '/');
  assert.ok(birds.indexOf('class="home"') < birds.indexOf('<h1'));
  assert.equal(birdsDoc.querySelector('title')?.textContent, 'birds1 · mattdoes.online');
  assert.equal(birdsDoc.querySelector('meta[property="og:title"]')?.getAttribute('content'), 'birds1 · mattdoes.online');

  for (const file of walkFiles(distDir)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(distDir, file);
    assert.equal(text.includes('unshared@mattdoes.online'), false, rel);
    assert.equal(text.includes('luciadoes+unshared@'), false, rel);
  }
  for (const rel of ['index.html', 'watching/index.html', 'listening/index.html', '404.html', 'unshared/index.html', 'unshared/birds1/index.html']) {
    const text = fs.readFileSync(path.join(distDir, rel), 'utf8');
    assert.doesNotMatch(text, /music\.apple\.com|open\.spotify\.com|bandcamp\.com|mailto:/i, rel);
    if (rel === 'unshared/index.html') {
      assert.match(text, /href="https:\/\/suno\.com\/@unshared"/);
    } else {
      assert.equal(text.includes('suno.com'), false, rel);
    }
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
