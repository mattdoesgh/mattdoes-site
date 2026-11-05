// The home letterboxd row previews the newest watch from the same snapshot.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderHome } from '../site/render.js';
import { REPO_ROOT } from './helpers/run-build.js';

const assets = { 'station.css': 'station.abc12345.css', 'station.js': 'station.abc12345.js' };

function home(watches) {
  return renderHome({
    siteUrl: 'https://mattdoes.online',
    assets,
    watches,
    tracks: [],
    builtAt: '2026-10-20T00:00:00.000Z',
  });
}

test('the home output includes the latest watch title and its rating stars', () => {
  const html = home([
    {
      title: 'Older',
      watchedDate: '2020-01-01',
      stars: '★',
      rating: 1,
      link: 'https://letterboxd.com/mattdoes/film/older/',
    },
    {
      title: 'Blue Heron',
      watchedDate: '2026-10-01',
      stars: '★★★★½',
      rating: 4.5,
      link: 'https://letterboxd.com/mattdoes/film/blue-heron/',
    },
  ]);
  const doc = new JSDOM(html).window.document;
  const row = [...doc.querySelectorAll('.verb-row')].find((item) => item.querySelector('a.verb')?.getAttribute('href') === '/watching/');
  assert.equal(row.querySelector('a.verb').textContent, 'matt does letterboxd');
  const preview = row.querySelector('.preview');
  assert.equal(preview.querySelector('a')?.textContent, 'Blue Heron');
  assert.equal(preview.querySelector('a')?.getAttribute('href'), 'https://letterboxd.com/mattdoes/film/blue-heron/');
  const stars = preview.querySelector('.stars');
  assert.equal(stars?.childNodes[0]?.nodeValue, '★★★★');
  assert.equal(stars?.querySelector('.star-half')?.textContent, '★');
  assert.equal(stars?.querySelector('.star-half .star-glyph')?.textContent, '★');
  assert.equal(stars?.querySelector('.star-glyph')?.getAttribute('style'), null);
  assert.equal(stars?.textContent, '★★★★★');
  assert.equal(stars?.textContent.includes('½'), false);
  assert.equal(stars?.innerHTML.includes('\u2BE8'), false);
  assert.equal(stars?.getAttribute('style'), null);
  assert.equal(stars?.getAttribute('aria-label'), '4.5 out of 5 stars');
  assert.equal(stars?.getAttribute('role'), 'img');
  assert.equal(html.includes('Older'), false);
});

test('a whole rating is only full stars', () => {
  const html = home([
    {
      title: 'Whole',
      watchedDate: '2026-04-04',
      stars: '★★★',
      rating: 3,
      link: 'https://letterboxd.com/mattdoes/film/whole/',
    },
  ]);
  const stars = new JSDOM(html).window.document.querySelector('.stars');
  assert.equal(stars?.textContent, '★★★');
  assert.equal(stars?.querySelector('.star-half'), null);
  assert.equal(stars?.getAttribute('aria-label'), '3 out of 5 stars');
});

test('the home movie link has no underline and stars use the pink stroke', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  assert.match(css, /\.preview a,\s*\.preview a:hover,\s*\.preview a:focus,\s*\.preview a:focus-visible,\s*\.preview a:active \{\s*text-decoration:\s*none;/);
  assert.match(css, /\.preview a:focus-visible \{\s*outline:\s*var\(--outline-focus\);\s*outline-offset:\s*var\(--outline-offset\);/);
  assert.doesNotMatch(css, /\.preview a[^{]*\{[^}]*padding/);
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  assert.match(tokens, /--outline-focus:\s*3px solid var\(--focus\);/);
  assert.match(tokens, /--outline-offset:\s*3px;/);
  assert.match(tokens, /--pink:\s*#f7c8d8;/);
  const support = css.slice(css.indexOf('@supports (-webkit-text-stroke: 0.025em var(--pink))'));
  assert.match(support, /\.stars\s*\{[^}]*-webkit-text-stroke:\s*max\(0\.025em,\s*1\.5px\) var\(--pink\);/);
  assert.doesNotMatch(support, /\.mark\b/);
  assert.doesNotMatch(css, /body\[data-polarity="flip"\] \.stars\s*\{[^}]*background/);
  assert.doesNotMatch(css, /\.stars[^{]*\{[^}]*box-shadow/);
  assert.match(css, /\.stars \.star-glyph\s*\{[^}]*width:\s*0\.5em;/);
  assert.match(css, /\.stars \.star-glyph\s*\{[^}]*width:\s*calc-size\(fit-content,\s*size \* 0\.5\);/);
  assert.match(css, /\.stars \.star-glyph\s*\{[^}]*clip-path:\s*inset\(-0\.15em 0 -0\.15em -0\.15em\);/);
  assert.match(css, /\.stars \.star-half::after\s*\{[^}]*content:\s*"★";/);
  assert.match(css, /\.stars \.star-half::after\s*\{[^}]*color:\s*var\(--pink\);/);
  assert.match(css, /\.stars \.star-half::after\s*\{[^}]*-webkit-text-stroke:\s*max\(0\.025em,\s*1\.5px\) var\(--pink\);/);
  assert.match(css, /\.stars \.star-half::after\s*\{[^}]*clip-path:\s*inset\(-0\.2em calc\(50% - max\(0\.025em,\s*1\.5px\)\) -0\.2em 50%\);/);
  assert.doesNotMatch(css, /\.stars \.star-half::after\s*\{[^}]*clip-path:\s*inset\(-0\.2em 50% -0\.2em calc\(50% - max\(0\.025em,\s*1\.5px\)\)\);/);
  assert.doesNotMatch(css, /\.stars[^{]*\{[^}]*transition/);
  assert.doesNotMatch(css, /\.star-half[^{]*\{[^}]*transition/);
});

test('a hover window under 1024 keeps a pink preview and no row rule', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const start = css.indexOf('@media (hover: hover) and (max-width: 1023px)');
  const query = css.slice(start, css.indexOf('@media', start + 10));
  assert.match(query, /\.verb-row \{[^}]*border-top:\s*var\(--line-none\)/);
  assert.match(query, /\.preview,\s*\.preview a,\s*\.preview \.stars \{[^}]*color:\s*var\(--pink\)/);
});

test('flags use the label tracking', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  for (const selector of ['.flag']) {
    const at = css.indexOf(`${selector} {`);
    const block = css.slice(at, css.indexOf('}', at));
    assert.match(block, /letter-spacing:\s*var\(--track-label\)/, selector);
  }
  assert.match(tokens, /--track-label:\s*0\.08em;/);
  assert.doesNotMatch(css, /--track-kicker/);
  assert.doesNotMatch(tokens, /--track-kicker/);
});

test('an unrated latest watch is just the title', () => {
  const html = home([
    {
      title: 'Unrated',
      watchedDate: '2026-02-02',
      stars: '',
      rating: null,
      link: 'https://letterboxd.com/mattdoes/film/unrated/',
    },
  ]);
  const doc = new JSDOM(html).window.document;
  const preview = doc.querySelector('a[href="/watching/"]')?.parentElement?.querySelector('.preview');
  assert.equal(preview?.textContent?.trim(), 'Unrated');
  assert.equal(preview?.querySelector('.stars'), null);
});
