import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  const html = fs.readFileSync(path.join(distDir, rel), 'utf8');
  return new JSDOM(html).window.document;
}

test('shared chrome keeps reading navigation compact and moves secondary links to the footer', () => {
  const d = doc('index.html');
  const primary = d.querySelector('nav[aria-label="primary"]');
  assert.ok(primary, 'desktop primary navigation must remain a named landmark');
  assert.deepEqual(
    [...primary.querySelectorAll('a')].map(link => [link.textContent.trim(), link.getAttribute('href')]),
    [
      ['writing', '/blog/'],
      ['listening', '/listening/'],
      ['about', '/about/'],
    ],
  );
  assert.equal(primary.querySelector('a[href="/posts/"], a[href="/thoughts/"]'), null);

  const social = d.querySelector('nav[aria-label="social"] a.x-link.gb');
  assert.ok(social, 'X must be a glass chip in its own topbar landmark');
  assert.equal(social.getAttribute('href'), 'https://x.com/mattdoes');
  assert.equal(social.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(social.querySelector('.x-link__full')?.textContent, '@mattdoes');
  assert.equal(social.querySelector('.x-link__short')?.textContent.replace(/\s+/g, ' ').trim(), 'X, @mattdoes');

  const search = d.querySelector('.topbar a.search-control[href="/search/"]');
  assert.ok(search, 'search must remain available as a compact topbar control');
  assert.equal(search.getAttribute('aria-label'), 'search');

  const menu = d.querySelector('.topbar details.mobile-menu');
  assert.ok(menu, 'narrow screens must have a compact disclosure menu');
  const summary = menu.querySelector('summary');
  assert.ok(summary, 'the compact menu must use a keyboard-operable summary');
  assert.ok(summary.querySelector('.menu-chip.gb'), 'the compact menu control is a glass chip');
  assert.equal(summary.querySelector('.visually-hidden')?.textContent.trim(), 'Site menu');
  assert.ok(menu.querySelector('nav[aria-label="site menu"] a[href="/about/"]'));
  const menuX = menu.querySelector('nav[aria-label="site menu"] a[href="https://x.com/mattdoes"]');
  assert.equal(menuX?.textContent.trim(), '@mattdoes');
  assert.equal(menuX?.getAttribute('rel'), 'noopener noreferrer');

  assert.equal(d.querySelector('.topbar a[href="/feed.xml"]'), null,
    'RSS belongs in the footer, not the persistent topbar');
  assert.equal(d.querySelector('.topbar a[href="/colophon/"]'), null,
    'colophon belongs in the footer, not the persistent topbar');

  const footer = d.querySelector('footer.site nav[aria-label="footer"]');
  assert.ok(footer, 'footer must retain a named navigation landmark');
  assert.deepEqual(
    [...footer.querySelectorAll('a')].map(link => [link.textContent.trim(), link.getAttribute('href')]),
    [
      ['digs', '/digs/'],
      ['movies', '/movies/'],
      ['grok says', '/grok/'],
      ['rss', '/feed.xml'],
      ['colophon', '/colophon/'],
      ['say hi', 'mailto:matt@mattdoes.online'],
    ],
  );
  assert.ok(footer.querySelector('button[data-tweaks-toggle]'), 'footer keeps the tweaks control');

  const profiles = d.querySelector('footer.site nav[aria-label="profiles"]');
  assert.ok(profiles, 'footer must expose profile links');
  assert.deepEqual(
    [...profiles.querySelectorAll('a')].map(link => [link.textContent.trim(), link.getAttribute('href')]),
    [
      ['letterboxd', 'https://letterboxd.com/mattdoes'],
      ['x', 'https://x.com/mattdoes'],
      ['instagram', 'https://www.instagram.com/mattdoes.ig'],
      ['last.fm', 'https://www.last.fm/user/djverism'],
    ],
  );
});

test('the shared frame has a quiet one-column layout and mobile menu breakpoint', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'static', '_shared.css'), 'utf8');
  assert.match(css, /\.page\s*\{[^}]*width:\s*min\(100%, var\(--col\)\)/s,
    'standard pages must use the centered content column');
  assert.match(css, /\.side-left, \.side-right\s*\{\s*display:\s*none/s,
    'legacy rails must not reserve a default layout column');
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.topbar \.primary-nav\s*\{\s*display:\s*none/s,
    'the desktop link row must not turn into a horizontally scrolling mobile nav');
  assert.doesNotMatch(css, /#pause-motion|\.motion-toggle/,
    'production chrome has no pause control; motion follows prefers-reduced-motion');
  assert.match(css, /@media \(prefers-reduced-motion:\s*no-preference\)[\s\S]*?\.site-field__track\s*\{[^}]*animation:/s,
    'field drift stays gated on the system motion preference');
  assert.match(css, /--geo-bg-opacity:\s*0\.14/, 'geo treatment must stay visually quiet by default');
});

test('the locked clear-glass system is on the homepage and the shared pages', () => {
  const home = doc('index.html');
  const field = home.querySelector('.site-field');
  assert.equal(field?.getAttribute('aria-hidden'), 'true');
  assert.equal(field?.querySelector('a'), null);
  assert.ok(field?.querySelector('svg'));
  assert.equal(home.querySelector('#pause-motion, .motion-toggle'), null,
    'the homepage chrome does not offer a motion toggle');
  assert.equal(doc('blog/index.html').querySelector('#pause-motion, .motion-toggle'), null);
  assert.ok(home.querySelector('.home-shelves a[href="/digs/"]'));
  assert.ok(home.querySelector('.home-shelves a[href="/movies/"]'));
  assert.ok(home.querySelector('.home-shelves a[href="/grok/"]'));
  assert.ok(home.querySelector('.topbar .primary-nav a.gb[href="/blog/"]'));

  assert.equal(doc('digs/index.html').querySelector('h1')?.textContent.trim(), 'digs');
  assert.equal(doc('movies/index.html').querySelector('h1')?.textContent.trim(), 'movies');
  assert.equal(doc('grok/index.html').querySelector('h1')?.textContent.trim(), 'grok says…');
  assert.ok(doc('blog/index.html').querySelector('.site-field'));
  assert.equal(doc('blog/index.html').querySelector('.design-dir'), null);
});
