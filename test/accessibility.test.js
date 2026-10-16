// Audit backlog: "Accessibility — Automated axe checks on generated pages".
// Covers audit findings #8, #9, #10, #16 (structural side) and the baseline
// skip-link / single-main checks.
//
// Two parts:
//   1. axe-core run against every generated dist/**/*.html, scoped to the
//      WCAG 2.0/2.1 A + AA rule tags. The color-contrast rule is DISABLED —
//      it needs a real layout/render engine and is unreliable in jsdom;
//      contrast is covered separately by test/contrast.test.js with
//      token-level math.
//   2. Direct structural assertions on remediated markup: skip link, a
//      single labelled <main id="main">, the native tweaks <dialog>, the
//      accent <fieldset>/<legend>/radio inputs, aria-current on the active
//      nav link, and head metadata (description, canonical, atom).
//
// Note: axe's `region` best-practice rule flags the topbar home/meta links
// that sit outside the <nav> landmark in templates/base.js. That is a
// pre-existing best-practice item, not a WCAG A/AA failure, and base.js is
// out of scope for this test suite — so we run the WCAG tag set, not
// best-practice. See test/MANUAL-CHECKS.md.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml } from './helpers/run-build.js';

const AXE_SRC = fs.readFileSync(
  path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8',
);

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

/** Load HTML into jsdom and run axe-core scoped to WCAG A/AA. */
async function axeScan(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.eval(AXE_SRC);
  return dom.window.axe.run(dom.window.document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    // color-contrast can't render in jsdom — covered by contrast.test.js.
    rules: { 'color-contrast': { enabled: false } },
  });
}

// ── 1. axe across every generated page ──────────────────────────────────
test('every generated page has zero WCAG A/AA axe violations', async (t) => {
  const files = listDistHtml(distDir);
  assert.ok(files.length > 0, 'expected dist/ to contain generated HTML');

  for (const file of files) {
    const rel = path.relative(distDir, file);
    await t.test(rel, async () => {
      const results = await axeScan(fs.readFileSync(file, 'utf8'));
      const summary = results.violations
        .map(v => `${v.id} (${v.nodes.length}×): ${v.help}`)
        .join('\n  ');
      assert.equal(results.violations.length, 0,
        `${rel} has axe violations:\n  ${summary}`);
    });
  }
});

// ── 2. structural assertions on remediated markup ───────────────────────
/** Parse a dist HTML file into a jsdom document. */
function doc(rel) {
  const html = fs.readFileSync(path.join(distDir, rel), 'utf8');
  return new JSDOM(html).window.document;
}

test('every page has a skip link targeting #main', () => {
  for (const file of listDistHtml(distDir)) {
    const rel = path.relative(distDir, file);
    const d = doc(rel);
    const skip = d.querySelector('a.skip-link');
    assert.ok(skip, `${rel} must have a skip link`);
    assert.equal(skip.getAttribute('href'), '#main',
      `${rel} skip link must target #main`);
  }
});

test('every page has exactly one <main id="main">', () => {
  for (const file of listDistHtml(distDir)) {
    const rel = path.relative(distDir, file);
    const d = doc(rel);
    const mains = d.querySelectorAll('main');
    assert.equal(mains.length, 1, `${rel} must have exactly one <main>`);
    assert.equal(mains[0].id, 'main', `${rel} <main> must have id="main"`);
  }
});

test('the tweaks panel is a native <dialog>', () => {
  const d = doc('index.html');
  const dialog = d.querySelector('dialog#tweaks');
  assert.ok(dialog, 'tweaks panel must be a native <dialog id="tweaks">');
  assert.ok(dialog.getAttribute('aria-labelledby'),
    'the tweaks <dialog> must be labelled (aria-labelledby)');
});

test('the accent control is a native <fieldset> of radio inputs', () => {
  const d = doc('index.html');
  const fieldset = d.querySelector('fieldset.tk-swatches');
  assert.ok(fieldset, 'accent control must be a <fieldset class="tk-swatches">');

  const legend = fieldset.querySelector('legend');
  assert.ok(legend && legend.textContent.trim(),
    'accent <fieldset> must have a non-empty <legend>');

  const radios = fieldset.querySelectorAll('input[type="radio"][name="tk-accent"]');
  assert.equal(radios.length, 4,
    'accent control must offer four radio inputs (warm/pink/blue/green)');
  const values = [...radios].map(r => r.value).sort();
  assert.deepEqual(values, ['blue', 'green', 'pink', 'warm']);
});

test('homepage keeps one quiet reading path and moves RSS to the footer', () => {
  const d = doc('index.html');
  const main = d.querySelector('main#main');
  assert.ok(main, 'homepage must render <main id="main">');

  const h1 = main.querySelector('.home-intro h1');
  assert.ok(h1, 'homepage must render a visible site heading');
  assert.ok(!h1.classList.contains('visually-hidden'),
    'homepage heading must not be visually hidden');
  assert.equal(h1.getAttribute('id'), 'home-title');
  assert.equal(main.querySelector('.home-intro .kicker'), null,
    'the topbar brand must not be repeated as an eyebrow');

  assert.equal(main.querySelector('.side-left, .side-right'), null,
    'homepage must not add competing rail navigation');
  assert.equal(main.querySelector('.home-lead, .home-recent, .home-archive-link'), null,
    'homepage must not highlight retired posts');
  assert.equal(main.querySelector('a[href="/blog/"], a[href^="/journal/"], a[href^="/making/"]'), null);

  assert.equal(d.querySelector('a[href="/feed.xml"]'), null,
    'the retired post feed must not be linked');
});

test('the active nav link carries aria-current="page"', () => {
  const d = doc('listening/index.html');
  const current = d.querySelectorAll('nav[aria-label="primary"] a[aria-current="page"]');
  assert.equal(current.length, 1,
    'exactly one primary-nav link should carry aria-current="page"');
  assert.match(current[0].getAttribute('href'), /\/listening\/?$/);
  assert.equal(current[0].textContent.trim(), 'listening');
});

test('<head> has description and canonical, and no post feed', () => {
  for (const rel of ['index.html', 'about/index.html', 'listening/index.html', 'digs/index.html']) {
    const d = doc(rel);
    const desc = d.querySelector('meta[name="description"]');
    assert.ok(desc && desc.getAttribute('content') != null,
      `${rel} must have <meta name="description">`);

    const canonical = d.querySelector('link[rel="canonical"]');
    assert.ok(canonical && canonical.getAttribute('href'),
      `${rel} must have a <link rel="canonical">`);

    assert.equal(d.querySelector('link[rel="alternate"][type="application/atom+xml"]'), null,
      `${rel} must not advertise the retired post feed`);
  }
});

test('<head> has Open Graph and Twitter sharing metadata', () => {
  const d = doc('index.html');
  assert.ok(d.querySelector('meta[property="og:title"]'),  'og:title present');
  assert.ok(d.querySelector('meta[property="og:type"]'),   'og:type present');
  assert.ok(d.querySelector('meta[property="og:url"]'),    'og:url present');
  assert.ok(d.querySelector('meta[property="og:image"]'),  'og:image present');
  const card = d.querySelector('meta[name="twitter:card"]');
  assert.ok(card, 'twitter:card present');
  assert.equal(card.getAttribute('content'), 'summary_large_image');
});
