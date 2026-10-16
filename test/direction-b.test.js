// Direction B is locked: clear glass on topbar chips and homepage shelf
// tiles, blur on the layer behind the label, and a faint two-mark field.
// A new link, a glass flag, or a brighter pattern should fail here.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault } from './helpers/run-build.js';

const CSS_PATH = path.join(process.cwd(), 'static', '_shared.css');
const LAYOUT_PATH = path.join(process.cwd(), 'design-system', 'src', 'components', 'Layout.tsx');

const BLUR_SELECTORS = new Set([
  '.topbar .gb::before, .home-shelves a.shelf-tile::before',
  ':where(.topbar) .gb::before, :where(.home-shelves) a.shelf-tile::before',
  'dialog#tweaks::backdrop',
]);

function backdropDeclarations(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(stripped))) {
    const selector = match[1].replace(/\s+/g, ' ').trim();
    for (const part of match[2].split(';')) {
      const decl = part.match(/^\s*(-webkit-backdrop-filter|backdrop-filter)\s*:\s*(.+)\s*$/i);
      if (decl) found.push({ selector, property: decl[1], value: decl[2].trim() });
    }
  }
  return found;
}

test('blur is only the chip layer, the shelf-tile layer, and the tweaks scrim', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const decls = backdropDeclarations(css);
  const blurs = decls.filter((decl) => decl.value !== 'none');
  assert.ok(blurs.length >= 2, 'the clear-glass layer should still blur');
  for (const decl of blurs) {
    assert.ok(
      BLUR_SELECTORS.has(decl.selector),
      `unexpected ${decl.property}: ${decl.value} on ${decl.selector}`,
    );
    if (decl.selector === 'dialog#tweaks::backdrop') {
      assert.equal(decl.value, 'blur(1px)');
    } else {
      assert.equal(decl.value, 'blur(12px)');
      assert.match(decl.selector, /::before$/);
    }
  }
  assert.ok(decls.some((decl) => decl.selector === '.topbar' && decl.value === 'none'));
  assert.doesNotMatch(css, /\bscanlines?\b|\bglitch\b|chromatic/);
});

test('the generative field stays two faint marks', () => {
  const layout = fs.readFileSync(LAYOUT_PATH, 'utf8');
  const pattern = layout.slice(layout.indexOf('<pattern'), layout.indexOf('</pattern>'));
  assert.match(pattern, /width="112"/);
  assert.match(pattern, /height="176"/);
  assert.deepEqual(
    [...pattern.matchAll(/opacity="([^"]+)"/g)].map((m) => m[1]),
    ['0.3', '0.16'],
  );
});

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  return new JSDOM(fs.readFileSync(path.join(distDir, rel), 'utf8')).window.document;
}

test('shipped pages put glass only on topbar chips and shelf tiles', () => {
  for (const rel of ['index.html', 'listening/index.html', 'digs/index.html', 'about/index.html']) {
    const page = doc(rel);
    for (const el of page.querySelectorAll('.gb')) {
      assert.ok(el.closest('.topbar'), `${rel} has glass outside the topbar`);
    }
    for (const el of page.querySelectorAll('.shelf-tile')) {
      assert.equal(el.tagName, 'A');
      assert.ok(el.closest('.home-shelves'), `${rel} has a shelf tile outside the shelves`);
    }
    assert.equal(page.querySelector('nav[aria-label="site menu"] .gb, nav[aria-label="site menu"] .shelf-tile'), null);
  }

  const home = doc('index.html');
  const tiles = [...home.querySelectorAll('.home-shelves a')];
  assert.ok(tiles.length >= 4);
  for (const tile of tiles) assert.ok(tile.classList.contains('shelf-tile'));
  assert.equal(home.querySelector('.home-lately .gb, .home-lately .shelf-tile, .home-wire .shelf-tile'), null);
  assert.ok(home.querySelector('.topbar .primary-nav a.gb'));

  const patterns = [...home.querySelectorAll('.site-field pattern')];
  assert.equal(patterns.length, 2);
  for (const pattern of patterns) {
    assert.equal(pattern.getAttribute('width'), '112');
    assert.equal(pattern.getAttribute('height'), '176');
    assert.deepEqual(
      [...pattern.querySelectorAll('rect')].map((rect) => rect.getAttribute('opacity')),
      ['0.3', '0.16'],
    );
  }
});
