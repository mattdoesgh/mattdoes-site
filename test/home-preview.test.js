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
  assert.match(css, /\.preview a:focus-visible \{\s*outline:\s*3px solid var\(--focus\);\s*outline-offset:\s*3px;/);
  assert.doesNotMatch(css, /\.preview a[^{]*\{[^}]*padding/);
  const support = css.slice(css.indexOf('@supports (-webkit-text-stroke: 0.025em #f7c8d8)'));
  assert.match(support, /\.stars\s*\{[^}]*-webkit-text-stroke:\s*max\(0\.025em,\s*1\.5px\) #f7c8d8;/);
  assert.doesNotMatch(support, /\.mark\b/);
  assert.match(support, /body\[data-polarity="flip"\] \.stars\s*\{[^}]*background-color:\s*#000000;/);
  assert.match(support, /body\[data-polarity="flip"\] \.stars\s*\{[^}]*box-shadow:\s*0 0 0 max\(0\.03em,\s*1px\) #000000;/);
  assert.match(css, /\.stars \.star-half\s*\{[^}]*width:\s*0\.5em;/);
  assert.match(css, /\.stars \.star-half\s*\{[^}]*width:\s*calc-size\(fit-content,\s*size \* 0\.5\);/);
  assert.match(css, /\.stars \.star-half\s*\{[^}]*clip-path:\s*inset\(-0\.15em 0 -0\.15em -0\.15em\);/);
  assert.doesNotMatch(css, /\.stars[^{]*\{[^}]*transition/);
  assert.doesNotMatch(css, /\.star-half[^{]*\{[^}]*transition/);
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
