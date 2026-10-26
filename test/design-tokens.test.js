// Raw colors, font families, and font sizes belong in site/tokens.css.
// A page that writes them directly fails the check.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  findTokenViolations,
  inlineStaticTokens,
  loadTokens,
  violationsInCss,
  violationsInSource,
  REPO_ROOT,
} from '../lib/design-tokens.js';
import { expandCssImports } from '../lib/emit/assets.js';
import { buildFixtureVault } from './helpers/run-build.js';

test('the site stylesheet and templates stay inside the token set', () => {
  const violations = findTokenViolations(REPO_ROOT);
  assert.deepEqual(violations, []);
});

test('a raw color, font family, or font size fails the check', () => {
  const tokens = loadTokens();
  const css = [
    '.bad {',
    '  color: #123456;',
    '  font-family: "Comic Sans", cursive;',
    '  font-size: 13px;',
    '  border-radius: 4px;',
    '}',
  ].join('\n');
  const violations = violationsInCss(css, 'example.css', tokens);
  assert.ok(violations.some((line) => line.includes('raw color #123456')));
  assert.ok(violations.some((line) => line.includes('font-family')));
  assert.ok(violations.some((line) => line.includes('font-size 13px')));
  assert.ok(violations.some((line) => line.includes('border-radius')));

  const source = violationsInSource(
    'const html = `<p style="color:#abcdef;font-size:20px;font-family:Georgia">`;',
    'example.js',
    tokens,
  );
  assert.ok(source.some((line) => line.includes('#abcdef')));
  assert.ok(source.some((line) => line.includes('font-size')));
  assert.ok(source.some((line) => line.includes('font-family')));
});

test('an unknown custom property fails even when it is written as var()', () => {
  const violations = violationsInCss(
    '.bad { color: var(--not-a-token); font-size: var(--type-nope); }',
    'example.css',
    loadTokens(),
  );
  assert.ok(violations.some((line) => line.includes('--not-a-token')));
  assert.ok(violations.some((line) => line.includes('--type-nope')));
});

test('the build inlines sizes and keeps the polarity colors', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const expanded = expandCssImports(source, path.join(REPO_ROOT, 'static', 'station.css'));
  const css = inlineStaticTokens(expanded);
  assert.match(css, /font-size:\s*clamp\(min\(4rem, 28vw\), 16vw, 8\.5rem\)/);
  assert.doesNotMatch(css, /var\(--type-/);
  assert.match(css, /--field:\s*#000000/);
  assert.match(css, /body\[data-polarity="flip"\][\s\S]*--field:\s*#f7c8d8/);
  assert.match(css, /-webkit-text-stroke:\s*max\(0\.025em,\s*1\.5px\) #f7c8d8/);
});

test('safe-area insets are tokens and the viewport opts in', () => {
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.match(
      tokens,
      new RegExp(`--space-page-${side}:\\s*max\\(var\\(--space-page\\), env\\(safe-area-inset-${side}, 0px\\)\\);`),
    );
  }
  const pages = ['site/render.js', 'concepts/hub.js', 'concepts/birds1/index.html', 'site/concept-home.js'];
  for (const file of pages) {
    const text = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    assert.match(text, /width=device-width, initial-scale=1, viewport-fit=cover/);
    assert.doesNotMatch(text, /maximum-scale|user-scalable/);
  }
  for (const file of ['static/station.css', 'concepts/hub.css', 'concepts/birds1/birds1.css', 'site/concept-online.css']) {
    const css = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    assert.equal(css.includes('env('), false, `${file} writes env() outside site/tokens.css`);
    assert.match(css, /padding-bottom:\s*var\(--space-page-bottom\)/);
    assert.match(css, /padding-left:\s*var\(--space-page-left\)/);
    assert.match(css, /padding-bottom:\s*var\(--space-page-desk-bottom\)/);
    assert.match(css, /padding-left:\s*var\(--space-page-desk-left\)/);
  }
});

test('the shipped stylesheet still carries the pink star stroke', () => {
  const { distDir } = buildFixtureVault();
  const shipped = fs.readdirSync(distDir).find((name) => /^station\.[0-9a-f]+\.css$/.test(name));
  assert.ok(shipped);
  const built = fs.readFileSync(path.join(distDir, shipped), 'utf8');
  assert.match(built, /--field:#000/);
  assert.match(built, /-webkit-text-stroke:\.025em #f7c8d8/);
  assert.doesNotMatch(built, /var\(--type-/);
  assert.match(built, /env\(safe-area-inset-bottom/);
  assert.match(built, /env\(safe-area-inset-left/);
  const home = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert.match(home, /viewport-fit=cover/);
});
