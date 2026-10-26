// The concept home is a branch preview. A main build keeps the verb list.
// The laser is light, and a combo never cancels a link.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { wcagContrast } from 'culori';
import { HtmlValidate } from 'html-validate';
import { conceptHomeEnabled, renderConceptHome } from '../site/concept-home.js';
import { runBuild, REPO_ROOT } from './helpers/run-build.js';

const assets = {
  'concept-online.css': 'concept-online.css',
  'concept-laser.js': 'concept-laser.js',
  'station.js': 'station.js',
};

const laserSrc = fs.readFileSync(path.join(REPO_ROOT, 'site', 'concept-laser.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(REPO_ROOT, 'site', 'concept-online.css'), 'utf8');

function page(extra = {}) {
  return renderConceptHome({
    siteUrl: 'https://mattdoes.online',
    assets,
    watches: [{
      title: 'The Insider',
      stars: '★★★★',
      link: 'https://letterboxd.com/mattdoes/film/the-insider/',
      watchedDate: '2026-10-20',
    }],
    tracks: [{
      track: 'Newer',
      artist: 'Later Band',
      date: '2026-10-20T00:00:00.000Z',
      link: 'https://www.last.fm/music/Later+Band/_/Newer',
    }],
    ...extra,
  });
}

test('the preview gate stays off for production', () => {
  assert.equal(conceptHomeEnabled({}), false);
  assert.equal(conceptHomeEnabled({ CF_PAGES_BRANCH: 'main' }), false);
  assert.equal(conceptHomeEnabled({ CF_PAGES_BRANCH: 'master' }), false);
  assert.equal(conceptHomeEnabled({ CONCEPT_HOME: '0', CF_PAGES_BRANCH: 'cursor/preview' }), false);
  assert.equal(conceptHomeEnabled({ CONCEPT_HOME: '1' }), true);
  assert.equal(conceptHomeEnabled({ CF_PAGES_BRANCH: 'cursor/concept-home-lasers-e1dd' }), true);
});

test('the concept page leads with unshared and keeps the listen line', () => {
  const html = page();
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), 'noindex');
  assert.match(doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '', /viewport-fit=cover/);
  assert.equal(html.includes('maximum-scale'), false);
  assert.equal(doc.querySelector('h1 .combo-live')?.textContent, 'matt does online');
  assert.match(doc.querySelector('.intro')?.textContent || '', /houston/);
  assert.equal(doc.querySelector('.stage-link')?.getAttribute('href'), '/unshared/birds1/');
  assert.equal(doc.querySelector('.series .combo-live')?.textContent, '01');
  const line = doc.querySelector('.listen-line');
  assert.equal(line?.querySelector('.listen-state')?.textContent, 'last listened');
  assert.equal(line?.querySelector('.listen-what')?.textContent, 'Newer — Later Band');
  assert.equal(line?.querySelector('a.verb'), null);
  assert.match(doc.querySelector('.watch-line')?.textContent || '', /The Insider/);
  assert.match(html, /href="https:\/\/github.com\/mattdoesgh\/mattdoes-site\/pull\/200"/);
  assert.equal(html.includes('aria-label="verbs"'), false);
  assert.equal(html.includes('javascript:'), false);
  assert.equal(doc.querySelectorAll('[data-combo]').length >= 4, true);
  assert.equal(doc.querySelector('.end-note')?.getAttribute('aria-live'), 'polite');
  assert.equal(doc.querySelector('.slices')?.getAttribute('aria-hidden'), 'true');
  assert.equal(doc.querySelector('.meter')?.getAttribute('aria-hidden'), 'true');
});

test('a bad watch link and a bad build-log href stay off the page', () => {
  const html = page({
    watches: [{ title: 'Nope <b>', link: 'javascript:alert(1)', watchedDate: '2026-10-01' }],
  });
  assert.equal(html.includes('href="javascript:'), false);
  assert.match(html, /Nope &lt;b&gt;/);
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('.watch-what')?.tagName, 'SPAN');
});

test('the laser token is light, and it clears AAA on black', () => {
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  const match = tokens.match(/--laser:\s*(#[0-9a-fA-F]{6})/);
  assert.ok(match);
  assert.equal(match[1].toLowerCase(), '#b8ff3c');
  assert.ok(wcagContrast(match[1], '#000000') >= 7);
  assert.equal(cssSrc.includes('color: var(--laser)'), false);
  assert.equal(cssSrc.includes('background-color: var(--laser)'), false);
  assert.equal(cssSrc.includes('border: var(--laser)'), false);
  assert.match(cssSrc, /prefers-reduced-motion:\s*reduce/);
  assert.match(cssSrc, /animation:\s*beam-drift 18s/);
  assert.equal(laserSrc.includes('preventDefault'), true);
  assert.match(laserSrc, /passive:\s*true/);
  assert.match(laserSrc, /sss/);
  assert.match(laserSrc, /ssstylish/);
  assert.equal(laserSrc.includes('innerHTML'), false);
});

function boot(html, { reduce = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://mattdoes.online/', runScripts: 'dangerously' });
  const { window } = dom;
  const timers = [];
  let seq = 1;
  window.matchMedia = (query) => ({
    matches: reduce && String(query).includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  window.requestAnimationFrame = (fn) => {
    fn();
    return 1;
  };
  window.setTimeout = (fn, ms) => {
    const id = seq;
    seq += 1;
    timers.push({ id, fn, ms: ms || 0 });
    return id;
  };
  window.clearTimeout = (id) => {
    const index = timers.findIndex((item) => item.id === id);
    if (index >= 0) timers.splice(index, 1);
  };
  let now = 1000;
  window.Date.now = () => now;
  const script = window.document.createElement('script');
  script.textContent = laserSrc;
  window.document.body.appendChild(script);
  return {
    window,
    advance(ms) { now += ms; },
    wave() {
      const batch = timers.splice(0, timers.length);
      for (const item of batch) item.fn();
    },
    flush() {
      for (let guard = 0; guard < 12 && timers.length; guard += 1) this.wave();
    },
    close() { window.close(); },
  };
}

function press(window, el) {
  el.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
}

test('a link gets one slice and the press is not cancelled', () => {
  const view = boot(page());
  try {
    const link = view.window.document.querySelector('.stage-link');
    const event = new view.window.Event('pointerdown', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(link.classList.contains('is-sliced'), true);
    assert.equal(view.window.document.querySelector('.mark').classList.contains('is-held'), false);
  } finally {
    view.close();
  }
});

test('five taps cut the wordmark, then the idle heals it', () => {
  const view = boot(page());
  try {
    const mark = view.window.document.querySelector('.mark');
    for (let i = 0; i < 5; i += 1) {
      view.advance(100);
      press(view.window, mark);
    }
    assert.equal(mark.querySelector('.meter-hits')?.textContent, '5 hits');
    assert.equal(mark.querySelector('.meter-rank')?.textContent, 'd');
    assert.equal(mark.querySelector('.meter-name')?.textContent, 'dope');
    assert.equal(mark.classList.contains('cut-5'), true);
    assert.equal(mark.querySelector('.combo-live')?.textContent, 'matt does online');
    assert.equal(view.window.document.querySelector('.end-note')?.textContent, '');
    view.flush();
    assert.equal(mark.classList.contains('is-held'), false);
    assert.equal(mark.classList.contains('cut-5'), false);
    assert.match(view.window.document.querySelector('.end-note')?.textContent || '', /5 hits/);
  } finally {
    view.close();
  }
});

test('fifty taps reach sss, then the meter steps down before it vanishes', () => {
  const view = boot(page());
  try {
    const mark = view.window.document.querySelector('.mark');
    const seen = [];
    for (let i = 0; i < 50; i += 1) {
      view.advance(50);
      press(view.window, mark);
      const letter = mark.querySelector('.meter-rank')?.textContent || '';
      if (letter && seen[seen.length - 1] !== letter) seen.push(letter);
    }
    assert.deepEqual(seen, ['d', 'c', 'b', 'a', 's', 'ss', 'sss']);
    assert.equal(mark.querySelector('.meter-name')?.textContent, 'ssstylish');
    assert.equal(mark.querySelector('.meter-hits')?.textContent, '50 hits');
    assert.equal(mark.classList.contains('is-sss'), true);
    assert.equal(mark.classList.contains('cut-6'), true);
    view.wave();
    assert.equal(mark.querySelector('.meter-rank')?.textContent, 'ss');
    assert.equal(mark.classList.contains('is-sss'), false);
    view.wave();
    assert.equal(mark.querySelector('.meter-rank')?.textContent, 's');
    assert.equal(mark.classList.contains('is-held'), true);
    view.wave();
    assert.equal(mark.classList.contains('is-held'), false);
    assert.match(view.window.document.querySelector('.end-note')?.textContent || '', /50 hits, sss ssstylish/);
  } finally {
    view.close();
  }
});

test('reduced motion updates the counter and does not cut the text', () => {
  const view = boot(page(), { reduce: true });
  try {
    const mark = view.window.document.querySelector('.mark');
    for (let i = 0; i < 6; i += 1) {
      view.advance(100);
      press(view.window, mark);
    }
    assert.equal(mark.querySelector('.meter-hits')?.textContent, '6 hits');
    assert.equal(mark.querySelector('.meter-rank')?.textContent, 'c');
    assert.equal(mark.classList.contains('is-held'), true);
    assert.equal([...mark.classList].some((name) => name.startsWith('cut-')), false);
    assert.equal(mark.classList.contains('is-sss'), false);
    assert.equal(mark.classList.contains('is-rake'), false);
  } finally {
    view.close();
  }
});

test('enter and space hit a focused wordmark, and enter still follows a link', () => {
  const view = boot(page());
  try {
    const { document, KeyboardEvent } = view.window;
    const mark = document.querySelector('.mark');
    mark.focus();
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    document.dispatchEvent(space);
    assert.equal(space.defaultPrevented, true);
    assert.equal(mark.querySelector('.meter-hits')?.textContent, '');
    const again = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.dispatchEvent(again);
    assert.equal(mark.querySelector('.meter-hits')?.textContent, '2 hits');
    view.advance(400);
    const link = document.querySelector('.stage-link');
    link.focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, false);
    assert.equal(link.classList.contains('is-sliced'), true);
  } finally {
    view.close();
  }
});

test('the main build omits the concept and a preview build serves it', () => {
  const off = runBuild({ env: { CONCEPT_HOME: '0', CF_PAGES_BRANCH: '' } });
  assert.equal(off.status, 0, off.stderr);
  const home = fs.readFileSync(path.join(off.distDir, 'index.html'), 'utf8');
  assert.match(home, /aria-label="verbs"/);
  assert.equal(home.includes('concept-online'), false);
  assert.equal(fs.readdirSync(off.distDir).some((name) => name.startsWith('concept-')), false);

  const on = runBuild({ env: { CONCEPT_HOME: '1', CF_PAGES_BRANCH: 'main' } });
  assert.equal(on.status, 0, on.stderr);
  const concept = fs.readFileSync(path.join(on.distDir, 'index.html'), 'utf8');
  assert.match(concept, /href="\/unshared\/birds1\/"/);
  assert.match(concept, /concept-online\.[0-9a-f]+\.css/);
  assert.match(concept, /concept-laser\.[0-9a-f]+\.js/);
  assert.equal(concept.includes('aria-label="verbs"'), false);
  assert.equal(fs.existsSync(path.join(on.distDir, 'watching', 'index.html')), true);
  const names = fs.readdirSync(on.distDir);
  assert.equal(names.some((name) => /^concept-online\.[0-9a-f]+\.css$/.test(name)), true);
  assert.equal(names.some((name) => /^concept-laser\.[0-9a-f]+\.js$/.test(name)), true);
});

test('the concept document passes html-validate and axe', async () => {
  const on = runBuild({ env: { CONCEPT_HOME: '1' } });
  assert.equal(on.status, 0, on.stderr);
  const htmlvalidate = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: {
      'no-trailing-whitespace': 'off',
      'void-style': 'off',
      'attribute-boolean-style': 'off',
      'attribute-empty-style': 'off',
      'require-sri': 'off',
    },
  });
  const report = await htmlvalidate.validateFile(path.join(on.distDir, 'index.html'));
  const messages = report.results.flatMap((result) => result.messages.map((msg) => `${msg.ruleId}: ${msg.message}`));
  assert.deepEqual(messages, []);

  const html = fs.readFileSync(path.join(on.distDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(path.join(REPO_ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8'));
  const results = await dom.window.axe.run(dom.window.document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  const summary = results.violations.map((item) => `${item.id}: ${item.help}`).join('\n');
  assert.equal(results.violations.length, 0, summary);
});
