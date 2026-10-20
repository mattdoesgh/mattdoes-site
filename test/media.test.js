// Poster markup: a mirrored image is evidence, with alt text. The first is
// eager. A watch without a poster stays the Evidence placeholder.

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderWatch } from '../site/render.js';

const ctx = {
  siteUrl: 'https://mattdoes.online',
  assets: { 'station.css': 'station.abc12345.css', 'station.js': 'station.abc12345.js' },
  tracks: [],
  playcount: 0,
  builtAt: '2026-10-20T00:00:00.000Z',
  watches: [
    {
      title: 'Blue Heron',
      year: '2025',
      stars: '★★★★',
      link: 'https://letterboxd.com/mattdoes/film/blue-heron/',
      review: 'quiet.',
      poster: 'https://media.mattdoes.online/posters/abc.jpg',
      posterWidth: 300,
      posterHeight: 450,
    },
    {
      title: 'No Still',
      year: '2024',
      stars: '',
      link: 'https://letterboxd.com/mattdoes/film/no-still/',
      review: '',
      poster: 'https://a.ltrbxd.com/not-mirrored.jpg',
    },
  ],
};

const doc = new JSDOM(renderWatch(ctx)).window.document;

test('a mirrored poster is an image with alt text and intrinsic size', () => {
  const img = doc.querySelector('img');
  assert.equal(img.getAttribute('src'), 'https://media.mattdoes.online/posters/abc.jpg');
  assert.match(img.getAttribute('alt'), /Blue Heron/);
  assert.equal(img.getAttribute('width'), '300');
  assert.equal(img.getAttribute('height'), '450');
  assert.equal(img.getAttribute('loading'), 'eager');
  assert.equal(img.getAttribute('fetchpriority'), 'high');
  assert.equal(img.closest('figure')?.querySelector('.kicker'), null);
  assert.doesNotMatch(img.closest('figure').textContent, /Evidence/);
});

test('an unmirrored poster is omitted', () => {
  const boxes = [...doc.querySelectorAll('.evidence')];
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].querySelector('img')?.getAttribute('alt').includes('Blue Heron'), true);
  assert.doesNotMatch(doc.body.textContent, /No still on file|Evidence/);
});

test('later posters would be lazy', () => {
  const html = renderWatch({
    ...ctx,
    watches: [
      ctx.watches[0],
      { ...ctx.watches[0], title: 'Second', poster: 'https://media.mattdoes.online/posters/def.jpg' },
    ],
  });
  const imgs = [...new JSDOM(html).window.document.querySelectorAll('img')];
  assert.equal(imgs[1].getAttribute('loading'), 'lazy');
  assert.equal(imgs[1].getAttribute('fetchpriority'), null);
});
