// Poster markup: a mirrored image is in the strip. The first is eager.
// The wide file stays off the image until the scene opens. A watch
// without a mirrored poster has no image.

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
      posterFull: 'https://media.mattdoes.online/posters/abc-full.jpg',
      posterFullWidth: 960,
      posterFullHeight: 1440,
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

test('a mirrored poster is a lazy-capable strip image and the wide file stays closed', () => {
  const img = doc.querySelector('.film-open img');
  const opener = img.closest('.film-open');
  assert.equal(img.hasAttribute('src'), false);
  assert.equal(img.getAttribute('data-src'), 'https://media.mattdoes.online/posters/abc.jpg');
  assert.equal(img.getAttribute('alt'), '');
  assert.equal(img.getAttribute('width'), '300');
  assert.equal(img.getAttribute('height'), '450');
  assert.equal(img.getAttribute('loading'), 'eager');
  assert.equal(img.getAttribute('decoding'), 'async');
  assert.equal(img.getAttribute('fetchpriority'), 'high');
  assert.equal(opener.getAttribute('data-full'), 'https://media.mattdoes.online/posters/abc-full.jpg');
  assert.equal(opener.getAttribute('data-full-width'), '960');
  assert.equal(opener.getAttribute('data-full-height'), '1440');
  assert.equal(opener.getAttribute('data-review'), 'quiet.');
  assert.equal(opener.querySelector('.name')?.textContent, 'Blue Heron');
  assert.doesNotMatch(opener.textContent, /quiet/);
  assert.equal(doc.querySelector('#scene-img'), null);
  const scene = doc.querySelector('#scene');
  assert.equal(scene?.getAttribute('hidden'), '');
  assert.equal(scene?.getAttribute('aria-modal'), 'true');
  assert.equal(doc.querySelector('.feed')?.nextElementSibling, scene);
  assert.doesNotMatch(doc.body.textContent, /Evidence/);
});

test('an unmirrored poster is omitted', () => {
  const films = [...doc.querySelectorAll('.film')];
  assert.equal(films.length, 2);
  assert.equal(films[0].querySelector('img')?.getAttribute('data-src'), 'https://media.mattdoes.online/posters/abc.jpg');
  assert.equal(films[0].querySelector('img')?.hasAttribute('src'), false);
  assert.equal(films[1].querySelector('img'), null);
  assert.equal(films[1].querySelector('.name')?.textContent, 'No Still');
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
