// Homepage design bake-off. The live homepage stays the editorial IndexPage.
// /design/ plus three sketches are extra routes: labelled, linked to the real
// shelves, noindex, and contrast-checked from the tokens in
// static/design-directions.css (axe cannot measure color in jsdom).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { wcagContrast, parse } from 'culori';
import { buildFixtureVault, readDist, REPO_ROOT } from './helpers/run-build.js';

const CSS_PATH = path.join(REPO_ROOT, 'static', 'design-directions.css');
const SHELVES = ['/blog/', '/thoughts/', '/listening/', '/digs/', '/movies/', '/grok/'];
const SELECTORS = [
  'html:has(.design-index)',
  'html:has(.design-dir--a)',
  'html:has(.design-dir--b)',
  'html:has(.design-dir--c)',
];

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  const html = readDist(distDir, rel);
  return new JSDOM(html).window.document;
}

function tokens(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(block, `missing token block ${selector}`);
  const out = {};
  for (const line of block[1].split('\n')) {
    const match = line.match(/--(dir-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

test('the live homepage is unchanged by the bake-off', () => {
  const home = doc('index.html');
  assert.ok(home.querySelector('main .home-content'), 'production homepage keeps its editorial layout');
  assert.equal(home.querySelector('.design-dir, .design-index'), null);
  assert.ok(home.querySelector('.topbar'), 'production chrome stays on /');
  assert.equal(home.querySelector('meta[name="robots"][content="noindex"]'), null);
});

test('the index and three directions are labelled, linked, and isolated', () => {
  const index = doc('design/index.html');
  assert.equal(index.querySelector('h1')?.textContent.trim(), 'Homepage directions');
  assert.equal(index.querySelector('.topbar'), null, 'sketches do not reuse the production topbar');
  assert.ok(index.querySelector('meta[name="robots"][content="noindex"]'));
  assert.ok(index.querySelector('link[rel="stylesheet"][href*="design-directions"]'));
  for (const id of ['a', 'b', 'c']) {
    const open = index.querySelector(`a[href="/design/${id}/"]`);
    assert.ok(open, `index links to direction ${id}`);
    assert.match(open.textContent, new RegExp(id, 'i'));
  }

  const expectCurrent = { a: 'A · geo cities', b: 'B · lain', c: 'C · hybrid' };
  for (const id of ['a', 'b', 'c']) {
    const page = doc(`design/${id}/index.html`);
    const rel = `design/${id}/index.html`;
    assert.equal(page.querySelectorAll('main').length, 1, `${rel} has one main`);
    assert.equal(page.querySelector('main')?.id, 'main');
    assert.equal(page.querySelector('a.skip-link')?.getAttribute('href'), '#main');
    assert.match(page.querySelector('h1')?.textContent || '', /matt\s+does/);
    assert.match(page.querySelector('.design-compare__name')?.textContent || '', new RegExp(`Direction ${id.toUpperCase()}`));
    assert.equal(page.querySelector('.topbar'), null);
    assert.ok(page.querySelector('meta[name="robots"][content="noindex"]'));
    const current = page.querySelector('nav[aria-label="design directions"] a[aria-current="page"]');
    assert.equal(current?.textContent.trim(), expectCurrent[id]);
    for (const href of SHELVES) {
      assert.ok(page.querySelector(`a[href="${href}"]`), `${rel} links to ${href}`);
    }
    assert.match(page.body.textContent, /Hiroshi Yoshimura/, `${rel} shows the current dig`);
    assert.match(page.body.textContent, /Reader features fixture/, `${rel} shows the editorial lead`);
    assert.equal(page.querySelectorAll('[id="now-playing"], [id="scrobble-count"]').length, 0,
      'sketches do not take over the live listening targets');
    const pause = page.querySelector('label.motion-toggle input#pause-motion');
    assert.equal(pause?.getAttribute('type'), 'checkbox', `${rel} has a pause control`);
    assert.match(page.querySelector('label.motion-toggle')?.textContent || '', /Pause motion/);
    if (id === 'b') {
      assert.equal(page.querySelector('.ticker'), null, `${rel} has no marquee`);
      assert.match(page.querySelector('.tagline')?.textContent || '', /somewhere quiet on the wired/);
      assert.ok(page.querySelector('dl.lately'), `${rel} lately is label and value rows`);
    } else {
      const ticker = page.querySelector('.ticker');
      assert.equal(ticker?.getAttribute('aria-hidden'), 'true', `${rel} ticker is decorative`);
      assert.equal(ticker?.querySelector('a'), null, `${rel} ticker has no links`);
    }
  }

  const lain = doc('design/b/index.html');
  assert.equal(lain.querySelector('.prompt, .protocol, .signals'), null, 'B is not a terminal');
  assert.equal(lain.querySelector('.rooms .idx'), null, 'B rooms are not a numbered shell index');
  const field = lain.querySelector('.field');
  assert.equal(field?.getAttribute('aria-hidden'), 'true', 'B pattern is decorative');
  assert.equal(field?.querySelector('a'), null, 'B pattern has no links');
  assert.ok(field?.querySelector('svg'), 'B pattern is a drawn field');
  assert.equal(lain.querySelector('.mist, .rain'), null, 'B has no color-mist weather');
  assert.doesNotMatch(lain.querySelector('h1')?.textContent || '', />/);
});

test('direction colors clear WCAG AA for text and the focus ring', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation:\s*none !important/);
  assert.match(css, /prefers-reduced-motion:\s*no-preference/);
  assert.match(css, /#pause-motion:checked/);
  assert.match(css, /animation-timeline:\s*view\(\)/);
  assert.match(css, /\.db \.gb \{[^}]*backdrop-filter:\s*blur\(40px\) saturate\(200%\)/);
  assert.match(css, /-webkit-backdrop-filter:\s*blur\(40px\) saturate\(200%\)/);
  assert.match(css, /prefers-reduced-transparency:\s*reduce/);
  assert.match(css, /prefers-contrast:\s*more/);
  assert.match(css, /@supports not \(backdrop-filter:\s*blur\(1px\)\)/);
  const bRoot = css.match(/\.db \{\s*([^}]*)\}/);
  assert.ok(bRoot, 'direction B root rule exists');
  assert.doesNotMatch(bRoot[1], /repeating-linear-gradient|text-shadow/);
  assert.match(css, /\.design-dir--c \.top \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /<marquee|animation:[^;]*steps\(/);

  for (const selector of SELECTORS) {
    const token = tokens(css, selector);
    for (const name of ['dir-bg', 'dir-surface', 'dir-ink', 'dir-mute', 'dir-link', 'dir-focus']) {
      assert.ok(token[name], `${selector} missing --${name}`);
      assert.ok(parse(token[name]), `${selector} --${name} is not a color`);
    }
    for (const fg of ['dir-ink', 'dir-mute', 'dir-link']) {
      for (const bg of ['dir-bg', 'dir-surface']) {
        const ratio = wcagContrast(token[fg], token[bg]);
        assert.ok(ratio >= 4.5, `${selector} --${fg} on --${bg} is ${ratio.toFixed(2)}, need >= 4.5`);
      }
    }
    for (const bg of ['dir-bg', 'dir-surface']) {
      const ratio = wcagContrast(token['dir-focus'], token[bg]);
      assert.ok(ratio >= 3, `${selector} focus on --${bg} is ${ratio.toFixed(2)}, need >= 3`);
    }
    for (const key of Object.keys(token)) {
      const chip = key.match(/^dir-chip-([a-z])$/);
      if (!chip) continue;
      const ink = token[`dir-chip-${chip[1]}-ink`];
      assert.ok(ink, `${selector} --${key} has no ink pair`);
      const ratio = wcagContrast(ink, token[key]);
      assert.ok(ratio >= 4.5, `${selector} chip ${chip[1]} is ${ratio.toFixed(2)}, need >= 4.5`);
    }
  }
});
