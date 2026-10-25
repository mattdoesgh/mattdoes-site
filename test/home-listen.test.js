// The home last.fm row's lower line. The static page says "last listened".
// The client swaps in "now listening" from /api/listening/now, and leaves
// the static line alone when the request fails.

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderHome } from '../site/render.js';
import { listenPair, listenView, staticListen } from '../lib/listen-line.js';
import { REPO_ROOT } from './helpers/run-build.js';

const assets = { 'station.css': 'station.abc12345.css', 'station.js': 'station.abc12345.js' };
const station = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');

function home(tracks) {
  return renderHome({
    siteUrl: 'https://mattdoes.online',
    assets,
    watches: [],
    tracks,
    builtAt: '2026-10-20T00:00:00.000Z',
  });
}

function row(html) {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll('.verb-row')].find((item) => item.querySelector('a.verb')?.getAttribute('href') === '/listening/');
}

test('the static last.fm line is the newest finished track', () => {
  const html = home([
    { track: 'Live One', artist: 'Now Band', nowPlaying: true, date: '2026-10-25T00:00:00.000Z', link: 'https://www.last.fm/music/Now+Band/_/Live+One' },
    { track: 'Older', artist: 'Then Band', date: '2026-10-01T00:00:00.000Z', link: 'https://www.last.fm/music/Then+Band/_/Older' },
    { track: 'Newer', artist: 'Later Band', date: '2026-10-20T00:00:00.000Z', link: 'https://www.last.fm/music/Later+Band/_/Newer' },
  ]);
  const line = row(html).querySelector('.listen-line');
  assert.equal(line.querySelector('.listen-state')?.textContent, 'last listened');
  assert.equal(line.querySelector('.listen-what')?.textContent, 'Newer — Later Band');
  assert.equal(line.querySelector('.listen-what')?.getAttribute('href'), 'https://www.last.fm/music/Later+Band/_/Newer');
  assert.match(line.querySelector('.listen-what')?.getAttribute('rel') || '', /\bnoopener\b/);
  assert.equal(line.querySelector('.listen-dot'), null);
  assert.equal(row(html).querySelector('a.verb .listen-line'), null);
  assert.equal(line.closest('a.verb'), null);
  assert.equal(html.includes('Live One'), false);
  assert.equal(new JSDOM(html).window.document.querySelector('.wave'), null);
});

test('a snapshot with only a live row still says last listened', () => {
  const html = home([
    { track: 'Live One', artist: 'Now Band', nowPlaying: true, link: 'https://www.last.fm/music/Now+Band/_/Live+One' },
  ]);
  const line = row(html).querySelector('.listen-line');
  assert.equal(line.textContent, 'last listened Live One — Now Band');
});

test('no track means no lower line', () => {
  const html = home([]);
  assert.equal(row(html).querySelector('.listen-line'), null);
  assert.equal(staticListen([]), null);
  assert.equal(staticListen([{ track: 'Only' }]), null);
});

test('the static line escapes text and drops unsafe links', () => {
  const html = home([
    {
      track: 'a<b>',
      artist: 'c&d',
      link: 'javascript:alert(1)',
      date: '2026-10-02T00:00:00.000Z',
    },
  ]);
  const line = row(html).querySelector('.listen-line');
  assert.equal(line.querySelector('.listen-what')?.tagName, 'SPAN');
  assert.equal(line.querySelector('.listen-what')?.textContent, 'a<b> — c&d');
  assert.equal(html.includes('href="javascript:'), false);
  assert.match(html, /a&lt;b&gt; — c&amp;d/);
  const profile = home([{
    track: 'Song',
    artist: 'Person',
    link: 'https://www.last.fm/user/djverism',
    date: '2026-10-02T00:00:00.000Z',
  }]);
  assert.equal(profile.includes('djverism'), false);
  assert.equal(row(profile).querySelector('.listen-what')?.tagName, 'SPAN');
});

test('a long title is clipped once in the static line', () => {
  const track = 'x'.repeat(40);
  const artist = 'y'.repeat(40);
  const html = home([{ track, artist, date: '2026-10-02T00:00:00.000Z', link: '' }]);
  const text = row(html).querySelector('.listen-what')?.textContent;
  assert.equal(text, listenPair(track, artist));
  assert.equal(text.length <= 48, true);
  assert.equal(text.endsWith('…'), true);
  assert.equal(text.includes(artist), false);
});

test('listen labels stay lowercase and the title keeps its case', () => {
  const view = listenView({ nowPlaying: true, track: 'Weird Fishes', artist: 'Radiohead', link: '' });
  assert.equal(view.state, 'now listening');
  assert.equal(view.pair, 'Weird Fishes — Radiohead');
  assert.equal(listenView({ nowPlaying: false }) , null);
  assert.equal(listenView({ nowPlaying: false, reason: 'warming', last: { track: 'A', artist: 'B' } }), null);
  assert.equal(listenView({ nowPlaying: true, track: '   ', artist: 'B' }), null);
});

test('the listen line clips on one row and does not animate', () => {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const block = css.slice(css.indexOf('.listen-line {'), css.indexOf('.listen-dot'));
  assert.match(block, /white-space:\s*nowrap/);
  assert.match(block, /text-overflow:\s*ellipsis/);
  assert.match(block, /overflow:\s*hidden/);
  assert.doesNotMatch(css, /\.listen-dot[^{]*\{[^}]*animation/);
  assert.doesNotMatch(css, /@keyframes\s+listen/);
  assert.equal(station.includes('innerHTML'), false);
});

function boot(html, fetchImpl, { hidden = false } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url: 'https://mattdoes.online/',
    runScripts: 'dangerously',
  });
  const { window } = dom;
  let isHidden = hidden;
  Object.defineProperty(window.document, 'hidden', {
    configurable: true,
    get: () => isHidden,
  });
  window.fetch = fetchImpl;
  const script = window.document.createElement('script');
  script.textContent = station;
  window.document.body.appendChild(script);
  return {
    window,
    setHidden(value) { isHidden = value; },
    close() { window.close(); },
  };
}

const STATIC = `<ol class="verbs"><li class="verb-row">
  <a class="verb" href="/listening/"><span class="verb-label">last.fm</span></a>
  <span class="preview listen-line"><span class="listen-state">last listened</span> <span class="listen-what">Keep — Artist</span></span>
</li></ol>`;

function jsonResponse(body, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  });
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('a failed now request keeps the static line', async () => {
  const page = boot(STATIC, () => Promise.reject(new Error('offline')));
  try {
    await flush();
    const line = page.window.document.querySelector('.listen-line');
    assert.equal(line.textContent, 'last listened Keep — Artist');
    assert.equal(line.querySelector('.listen-dot'), null);
  } finally {
    page.close();
  }
});

test('a warming payload and an empty now payload keep the static line', async () => {
  for (const body of [
    { nowPlaying: true, track: 'Nope', artist: 'Nope', reason: 'warming' },
    { nowPlaying: false },
    { nowPlaying: true, track: '', artist: '' },
  ]) {
    const page = boot(STATIC, (url) => {
      if (String(url).includes('/recent')) return jsonResponse({ playcount: 1, tracks: [] });
      assert.equal(String(url), '/api/listening/now');
      return jsonResponse(body);
    });
    try {
      await flush();
      assert.equal(page.window.document.querySelector('.listen-line').textContent, 'last listened Keep — Artist');
    } finally {
      page.close();
    }
  }
});

test('now playing replaces the line and escapes the title', async () => {
  const track = '<img src=x onerror=alert(1)>';
  const page = boot(STATIC, () => jsonResponse({
    nowPlaying: true,
    track,
    artist: 'Radiohead',
    link: 'https://www.last.fm/music/Radiohead/_/song',
  }));
  try {
  await flush();
  const line = page.window.document.querySelector('.listen-line');
  const view = listenView({ nowPlaying: true, track, artist: 'Radiohead', link: '' });
  assert.equal(line.querySelector('.listen-state')?.textContent, 'now listening');
  assert.equal(line.querySelector('.listen-what')?.textContent, view.pair);
  assert.equal(line.querySelector('.listen-dot')?.textContent, '●');
  assert.equal(line.querySelector('.listen-dot')?.getAttribute('aria-hidden'), 'true');
  assert.equal(line.querySelector('img'), null);
  assert.equal(line.querySelector('.listen-what')?.getAttribute('href'), 'https://www.last.fm/music/Radiohead/_/song');
  assert.equal(line.querySelector('a.verb .listen-what'), null);
  assert.equal(line.closest('a'), null);
  } finally {
    page.close();
  }
});

test('nothing playing falls back to the newest track', async () => {
  const page = boot(STATIC, () => jsonResponse({
    nowPlaying: false,
    last: {
      track: 'Weird Fishes',
      artist: 'Radiohead',
      link: 'javascript:alert(1)',
    },
  }));
  try {
    await flush();
    const line = page.window.document.querySelector('.listen-line');
    assert.equal(line.textContent, 'last listened Weird Fishes — Radiohead');
    assert.equal(line.querySelector('.listen-dot'), null);
    assert.equal(line.querySelector('.listen-what')?.tagName, 'SPAN');
  } finally {
    page.close();
  }
});

test('the client clips a long now-playing title', async () => {
  const track = 'Very Long Title '.repeat(8);
  const artist = 'Very Long Artist';
  const page = boot(STATIC, () => jsonResponse({
    nowPlaying: true,
    track,
    artist,
    link: 'https://www.last.fm/user/djverism',
  }));
  try {
    await flush();
    const what = page.window.document.querySelector('.listen-what');
    assert.equal(what.textContent, listenPair(track, artist));
    assert.equal(what.textContent.endsWith('…'), true);
    assert.equal(what.tagName, 'SPAN');
    assert.equal(page.window.document.body.innerHTML.includes('djverism'), false);
  } finally {
    page.close();
  }
});

test('a hidden tab does not poll, and a visible tab resumes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let page;
  try {
    page = boot(STATIC, (url) => {
      if (String(url).includes('/api/listening/now')) calls += 1;
      return jsonResponse({
        nowPlaying: false,
        last: { track: 'Keep', artist: 'Artist', link: '' },
      });
    });
    await flush();
    assert.equal(calls, 1);
    page.setHidden(true);
    page.window.document.dispatchEvent(new page.window.Event('visibilitychange'));
    mock.timers.tick(180000);
    await flush();
    assert.equal(calls, 1);
    page.setHidden(false);
    page.window.document.dispatchEvent(new page.window.Event('visibilitychange'));
    await flush();
    assert.equal(calls, 2);
    mock.timers.tick(60000);
    await flush();
    assert.equal(calls, 3);
  } finally {
    page?.close();
    mock.timers.reset();
  }
});

test('a document that is already hidden does not fetch', async () => {
  let calls = 0;
  const page = boot(STATIC, (url) => {
    if (String(url).includes('/api/listening/now')) calls += 1;
    return jsonResponse({ nowPlaying: false });
  }, { hidden: true });
  try {
    await flush();
    assert.equal(calls, 0);
  } finally {
    page.close();
  }
});
