import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault } from './helpers/run-build.js';
import { siteConfig } from '../site.config.js';

const PROFILES = [
  ['letterboxd', 'https://letterboxd.com/mattdoes'],
  ['x', 'https://x.com/mattdoes'],
  ['instagram', 'https://www.instagram.com/mattdoes.ig'],
  ['last.fm', 'https://www.last.fm/user/djverism'],
];

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  return new JSDOM(fs.readFileSync(path.join(distDir, rel), 'utf8')).window.document;
}

test('profile hrefs in the about page match site config and the footer', () => {
  for (const [, href] of PROFILES) {
    assert.ok(siteConfig.links.some((link) => link.href === href), `${href} must be a site link`);
  }
  assert.equal(
    siteConfig.links.find((link) => link.label === 'letterboxd').href,
    siteConfig.letterboxd.profile,
  );

  const about = doc('about/index.html');
  for (const [, href] of PROFILES) {
    assert.ok(about.querySelector(`a[href="${href}"]`), `about must link to ${href}`);
  }
});

test('/digs/ renders the week of 2026-10-12 with lazy, allowlisted players', () => {
  const d = doc('digs/index.html');
  assert.equal(d.querySelector('h1').textContent.trim(), 'digs');
  assert.equal(d.querySelector('.sample-flag'), null, 'a published week is not labeled sample');
  for (const artist of [
    'Lauren Bousfield',
    'Youth Code',
    'Black Dresses',
    'Caterina Barbieri',
    'Fabio Frizzi',
    'Aïsha Devi',
  ]) {
    assert.match(d.body.textContent, new RegExp(artist));
  }
  assert.match(d.body.textContent, /favorite/);
  assert.doesNotMatch(d.body.textContent, /Hiroshi Yoshimura|loscil/);

  const frames = [...d.querySelectorAll('iframe')];
  // Five picks embed Apple and Bandcamp; Fabio Frizzi is Apple only.
  assert.equal(frames.length, 11);
  for (const frame of frames) {
    assert.equal(frame.getAttribute('loading'), 'lazy');
    assert.ok(frame.getAttribute('title'), 'players need an accessible name');
    const src = frame.getAttribute('src');
    assert.ok(
      src.startsWith('https://embed.music.apple.com/') || src.startsWith('https://bandcamp.com/EmbeddedPlayer/'),
      src,
    );
  }
  const frizzi = d.getElementById('pick-2026-10-12-4');
  assert.equal(frizzi?.querySelector('a[href*="bandcamp.com"]'), null);
  assert.ok(frizzi?.querySelector('iframe[src*="embed.music.apple.com"]'));
  assert.equal(d.querySelector('iframe[src*="letterboxd"]'), null);
});

test('/movies/ is recent watches only and does not embed the feed', () => {
  const d = doc('movies/index.html');
  assert.equal(d.querySelector('h1').textContent.trim(), 'movies');
  assert.equal(d.querySelector('iframe'), null, 'movies must not embed a feed');
  assert.equal(d.querySelector('a[href="https://letterboxd.com/mattdoes/rss/"]'), null);
  assert.ok(d.querySelector('a[href="https://letterboxd.com/mattdoes"]'));
  // Offline fixture builds have no diary snapshot. The page still renders.
  assert.match(d.body.textContent, /No recent watches in this build/);
});

test('/grok/ points at digs favorites and does not repeat the players', () => {
  const d = doc('grok/index.html');
  assert.equal(d.querySelector('h1').textContent.trim(), 'grok says…');
  const fav = d.querySelector('a[href="/digs/#pick-2026-10-12-0"]');
  assert.ok(fav, 'the hub must link at the favorite pick on /digs/');
  assert.equal(fav.textContent.trim(), 'Lauren Bousfield');
  assert.match(fav.parentElement?.textContent || '', /Salesforce/);
  assert.equal(d.querySelector('.sample-flag'), null, 'a published favorite is not labeled sample');
  assert.equal(d.querySelector('iframe'), null, 'players live on /digs/, not a second copy here');
  assert.ok(d.querySelector('a[href="/digs/"]'));
  assert.ok(d.querySelector('nav[aria-label="sections"] a[href="/movies/"]'));
});

test('the three pages are in the footer and mark themselves current', () => {
  const digs = doc('digs/index.html');
  const current = digs.querySelector('footer.site a[aria-current="page"]');
  assert.equal(current?.getAttribute('href'), '/digs/');
  assert.equal(digs.querySelector('nav[aria-label="primary"] a[aria-current="page"]'), null,
    'digs stays out of the reading nav');
});
