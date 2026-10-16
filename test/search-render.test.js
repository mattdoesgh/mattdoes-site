// Search results are rendered from /search-index.json. Kind and title must
// be text, and the href must go through the same allowlist as safeUrl().

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { safeUrl } from '../templates/_helpers.js';

const REPO_ROOT = process.cwd();

function searchPage() {
  return `<!DOCTYPE html>
<html><body>
<form id="search-form" action="/search/" method="get">
  <input id="search-q" name="q" type="search" />
</form>
<p id="search-status"></p>
<div id="search-results"></div>
</body></html>`;
}

test('search results use text and the safeUrl allowlist', async () => {
  const dom = new JSDOM(searchPage(), { url: 'https://mattdoes.online/search/' });
  const { window } = dom;
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
  };
  globalThis.window = window;
  globalThis.document = window.document;

  const index = [
    {
      title: '<script>alert(1)</script>',
      url: 'javascript:alert(1)',
      summary: 'bad',
      kind: '<img src=x onerror=alert(1)>',
      tags: ['payload'],
      text: 'payload',
    },
    {
      title: 'Hello',
      url: '/listening/',
      summary: 'notes',
      kind: 'page',
      tags: ['hello'],
      text: 'Hello notes',
    },
    {
      title: 'Escape',
      url: '../secret',
      summary: '',
      kind: 'note',
      tags: ['escape'],
      text: 'escape',
    },
    {
      title: 'Proto',
      url: '//evil.example/x',
      summary: '',
      kind: 'note',
      tags: ['proto'],
      text: 'proto',
    },
  ];

  let fetched;
  globalThis.fetch = () => {
    fetched = Promise.resolve(new Response(JSON.stringify(index), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    return fetched;
  };

  try {
    const helpersUrl = pathToFileURL(path.join(REPO_ROOT, 'templates', '_helpers.js')).href;
    const source = fs.readFileSync(path.join(REPO_ROOT, 'static', 'search.js'), 'utf8')
      .replace("from './_helpers.js'", `from ${JSON.stringify(helpersUrl)}`);
    const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
    await import(dataUrl);
    await fetched;
    await new Promise((resolve) => setImmediate(resolve));

    const input = window.document.getElementById('search-q');
    const results = window.document.getElementById('search-results');

    async function search(q) {
      input.value = q;
      input.dispatchEvent(new window.Event('input'));
      await new Promise((resolve) => setImmediate(resolve));
    }

    await search('payload');
    assert.equal(results.querySelector('img'), null);
    assert.equal(results.querySelector('script'), null);
    assert.equal(results.querySelector('.kind').textContent, index[0].kind);
    assert.equal(results.querySelector('strong').textContent, index[0].title);
    assert.equal(results.querySelector('a').getAttribute('href'), safeUrl(index[0].url));
    assert.equal(results.querySelector('a').getAttribute('href'), '#');

    await search('hello');
    assert.equal(results.querySelector('strong').textContent, 'Hello');
    assert.equal(results.querySelector('.kind').textContent, 'page');
    assert.equal(results.querySelector('a').getAttribute('href'), '/listening/');

    await search('escape');
    assert.equal(results.querySelector('a').getAttribute('href'), '#');

    await search('proto');
    assert.equal(results.querySelector('a').getAttribute('href'), safeUrl('//evil.example/x'));
    assert.equal(results.querySelector('a').getAttribute('href'), '#');
  } finally {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
  }
});
