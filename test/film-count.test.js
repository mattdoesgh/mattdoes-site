// Lifetime films-watched count. The diary RSS has no total. The films page's
// Watched heading does. A miss hides the line; it does not bake a zero.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { filmsPageUrl, parseFilmCount } from '../lib/letterboxd.js';
import { fetchFilmCount } from '../lib/watches.js';
import { renderWatch, renderHome } from '../site/render.js';
import { installFetch } from './helpers/worker-env.js';
import { buildFixtureVault, makeTempDir, readDist } from './helpers/run-build.js';

const FILMS = 'https://letterboxd.com/mattdoes/films/';

function watched(title) {
  return `<h1 class="section-heading"><span class="tooltip" title="${title}">Watched</span></h1>`;
}

function htmlResponse(body, { status = 200, type = 'text/html; charset=utf-8', url = '' } = {}) {
  const res = new Response(body, { status, headers: { 'content-type': type } });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
}

function withoutOffline(fn) {
  const prev = process.env.LETTERBOXD_OFFLINE;
  delete process.env.LETTERBOXD_OFFLINE;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev == null) delete process.env.LETTERBOXD_OFFLINE;
      else process.env.LETTERBOXD_OFFLINE = prev;
    });
}

function writeCount(cacheDir, filmCount, { stale = false, file = 'letterboxd-count.json' } = {}) {
  const full = path.join(cacheDir, file);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(full, JSON.stringify({ fetchedAt: '2020-01-01T00:00:00.000Z', filmCount }));
  if (stale) {
    const old = Date.now() / 1000 - 99_999;
    fs.utimesSync(full, old, old);
  }
  return full;
}

const pageCtx = {
  siteUrl: 'https://mattdoes.online',
  assets: { 'station.css': 'station.abc12345.css', 'station.js': 'station.abc12345.js' },
  watches: [],
};

test('filmsPageUrl stays on the letterboxd profile', () => {
  assert.equal(filmsPageUrl('https://letterboxd.com/mattdoes'), FILMS);
  assert.equal(filmsPageUrl('https://letterboxd.com/mattdoes/'), FILMS);
  assert.equal(filmsPageUrl('https://www.letterboxd.com/mattdoes'), FILMS);
  assert.equal(filmsPageUrl('http://letterboxd.com/mattdoes'), '');
  assert.equal(filmsPageUrl('https://evil.example/mattdoes'), '');
  assert.equal(filmsPageUrl('https://letterboxd.com/mattdoes/films/'), '');
  assert.equal(filmsPageUrl('https://letterboxd.com/a/b'), '');
  assert.equal(filmsPageUrl('https://user:pass@letterboxd.com/mattdoes'), '');
  assert.equal(filmsPageUrl(''), '');
});

test('parseFilmCount reads the Watched tooltip and rejects a bad total', () => {
  assert.equal(parseFilmCount(watched('89&nbsp;films')), 89);
  assert.equal(parseFilmCount(watched('1,234&nbsp;films')), 1234);
  assert.equal(parseFilmCount(watched('1&#160;film')), 1);
  assert.equal(parseFilmCount(watched('89 films')), 89);
  assert.equal(parseFilmCount(`<div>${watched('89&nbsp;films')}</div>`), 89);
  assert.equal(parseFilmCount(watched('0&nbsp;films')), null);
  assert.equal(parseFilmCount(watched('100,001&nbsp;films')), null);
  assert.equal(parseFilmCount(watched('89&nbsp;movies')), null);
  assert.equal(parseFilmCount(watched('about 89 films')), null);
  assert.equal(parseFilmCount('<h1 class="section-heading"><span class="tooltip" title="89&nbsp;films">Liked</span></h1>'), null);
  assert.equal(parseFilmCount('<title>Just a moment...</title>'), null);
  assert.equal(parseFilmCount(''), null);
});

test('watching renders the shared wave and hides a missing count', () => {
  const shown = new JSDOM(renderWatch({ ...pageCtx, filmCount: 1234 })).window.document;
  const main = shown.querySelector('main');
  assert.equal(main.querySelector('h1')?.nextElementSibling?.className, 'watch-head');
  assert.equal(main.querySelector('.total-num')?.textContent, '1,234');
  assert.equal(main.querySelector('.total-spoken')?.textContent, 'films');
  assert.equal(main.querySelector('.wave')?.getAttribute('aria-hidden'), 'true');
  assert.equal(main.querySelector('.wave')?.textContent, 'films');
  assert.equal(main.querySelectorAll('.wave span').length, 5);
  assert.equal(main.querySelector('.watch-head')?.nextElementSibling?.className, 'feed');
  assert.equal(main.querySelector('.total')?.nextElementSibling?.className, 'poster-controls');
  assert.equal([...main.querySelectorAll('h2')].length, 0);
  assert.doesNotMatch(main.textContent, /Letterboxd/);

  for (const filmCount of [undefined, null, 0, -3, Number.NaN, 'nope']) {
    const hidden = new JSDOM(renderWatch({ ...pageCtx, filmCount })).window.document;
    assert.equal(hidden.querySelector('.total'), null, String(filmCount));
    assert.equal(hidden.querySelector('h1')?.nextElementSibling?.className, 'watch-head');
    assert.equal(hidden.querySelector('.watch-head')?.nextElementSibling?.className, 'feed');
  }

  const home = new JSDOM(renderHome({ ...pageCtx, filmCount: 1234, watches: [] })).window.document;
  assert.equal(home.querySelector('.total'), null);
});

test('fetchFilmCount uses the films page, caches it, and hides a miss', async () => {
  await withoutOffline(async () => {
    const cacheDir = makeTempDir('mattdoes-count-');
    const { calls, restore } = installFetch((url) => {
      assert.equal(url, FILMS);
      return htmlResponse(watched('89&nbsp;films'));
    });
    try {
      const count = await fetchFilmCount({ cacheDir });
      assert.equal(count, 89);
      assert.equal(calls.length, 1);
      const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, 'letterboxd-count.json'), 'utf8'));
      assert.equal(cached.filmCount, 89);
    } finally { restore(); }

    const again = makeTempDir('mattdoes-count-');
    writeCount(again, 89);
    const { calls: skipped, restore: restoreSkip } = installFetch(() => {
      throw new Error('fresh cache must not fetch');
    });
    try {
      assert.equal(await fetchFilmCount({ cacheDir: again }), 89);
      assert.equal(skipped.length, 0);
    } finally { restoreSkip(); }
  });
});

test('fetchFilmCount keeps a stale cache when the films page has no total', async () => {
  await withoutOffline(async () => {
    const cacheDir = makeTempDir('mattdoes-count-');
    writeCount(cacheDir, 89, { stale: true });
    const { restore } = installFetch(() => htmlResponse('<title>Just a moment...</title>'));
    try {
      assert.equal(await fetchFilmCount({ cacheDir }), 89);
      const cached = JSON.parse(fs.readFileSync(path.join(cacheDir, 'letterboxd-count.json'), 'utf8'));
      assert.equal(cached.filmCount, 89);
    } finally { restore(); }

    const empty = makeTempDir('mattdoes-count-');
    const { restore: restoreEmpty } = installFetch(() => htmlResponse(watched('0&nbsp;films'), { status: 200 }));
    try {
      assert.equal(await fetchFilmCount({ cacheDir: empty }), null);
      assert.equal(fs.existsSync(path.join(empty, 'letterboxd-count.json')), false);
    } finally { restoreEmpty(); }
  });
});

test('fetchFilmCount refuses a page that leaves letterboxd and stays offline', async () => {
  await withoutOffline(async () => {
    const cacheDir = makeTempDir('mattdoes-count-');
    const { restore } = installFetch(() => htmlResponse(watched('89&nbsp;films'), { url: 'https://evil.example/films/' }));
    try {
      assert.equal(await fetchFilmCount({ cacheDir }), null);
      assert.equal(fs.existsSync(path.join(cacheDir, 'letterboxd-count.json')), false);
    } finally { restore(); }
  });

  const prev = process.env.LETTERBOXD_OFFLINE;
  process.env.LETTERBOXD_OFFLINE = '1';
  const cacheDir = makeTempDir('mattdoes-count-');
  writeCount(cacheDir, 40, { stale: true });
  const { calls, restore } = installFetch(() => {
    throw new Error('offline must not fetch');
  });
  try {
    assert.equal(await fetchFilmCount({ cacheDir }), 40);
    assert.equal(calls.length, 0);
    assert.equal(await fetchFilmCount({ cacheDir: makeTempDir('mattdoes-count-') }), null);
  } finally {
    restore();
    if (prev == null) delete process.env.LETTERBOXD_OFFLINE;
    else process.env.LETTERBOXD_OFFLINE = prev;
  }
});

test('a count cached beside the diary is baked into /watching/ only', () => {
  const cacheDir = makeTempDir('mattdoes-count-');
  writeCount(cacheDir, 89, { file: 'letterboxd.json' });
  const withCount = buildFixtureVault({ cacheDir });
  const html = readDist(withCount.distDir, 'watching/index.html');
  const main = new JSDOM(html).window.document.querySelector('main');
  assert.equal(main.querySelector('.total-num')?.textContent, '89');
  assert.equal(main.querySelector('.total-spoken')?.textContent, 'films');
  assert.equal(main.querySelector('.wave')?.getAttribute('aria-hidden'), 'true');
  const home = new JSDOM(readDist(withCount.distDir, 'index.html')).window.document;
  assert.equal(home.querySelector('.total'), null);

  const missing = buildFixtureVault();
  const bare = new JSDOM(readDist(missing.distDir, 'watching/index.html')).window.document;
  assert.equal(bare.querySelector('.total'), null);
  assert.doesNotMatch(bare.body.textContent, /\bfilms\b/);
});
