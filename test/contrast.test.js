// Audit backlog: "Contrast — Token-level contrast assertions for themes and
// selectable accents". Covers audit finding #6 (WCAG 1.4.3, 1.4.11, 2.4.7).
//
// axe's color-contrast rule needs a real layout engine and does not work in
// jsdom, so contrast is verified here with token-level math instead:
//   - The theme tokens (--bg, --surface, --ink) are parsed out of
//     static/_shared.css for BOTH the dark (:root) and light
//     (html[data-theme="light"]) blocks.
//   - The four selectable accents are parsed out of static/tweaks.js
//     (the ACCENTS map the client applies as the inline --accent).
//   - --accent-fg is resolved per the CSS rule: in dark mode it mirrors
//     --accent; in light mode it is color-mix(in oklch, --accent, --ink 68%).
//   - --focus is --ink in both themes.
//   - culori converts every colour (hex / oklch) to sRGB and computes the
//     WCAG contrast ratio.
//
// Assertions:
//   - --accent-fg text vs --bg AND vs --surface >= 4.5:1, for BOTH themes
//     and ALL FOUR accents (normal-text threshold).
//   - --focus vs --bg AND vs --surface >= 3:1 (non-text UI threshold).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, interpolate, wcagContrast } from 'culori';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const css      = fs.readFileSync(path.join(REPO, 'static', '_shared.css'), 'utf8');
const tweaksJs = fs.readFileSync(path.join(REPO, 'static', 'tweaks.js'), 'utf8');

// ── token extraction ────────────────────────────────────────────────────
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pull a CSS custom-property value out of a named rule block. `selector` is a
 * literal CSS selector — it is regex-escaped here. The block opener is
 * anchored with a `[^{]` lookahead so the bare `html` selector does not also
 * match `html[data-theme="light"]`.
 */
function tokenFrom(selector, prop) {
  const blockRe = new RegExp(
    escapeRe(selector) + '\\s*\\{([^{}]*)\\}',
  );
  const block = css.match(blockRe);
  assert.ok(block, `could not find CSS rule "${selector}" in _shared.css`);
  const propRe = new RegExp('--' + escapeRe(prop) + '\\s*:\\s*([^;]+);');
  const m = block[1].match(propRe);
  assert.ok(m, `could not find --${prop} inside "${selector}"`);
  return m[1].trim();
}

// Dark theme lives in the bare `html { ... }` block; light theme overrides
// in `html[data-theme="light"] { ... }`. The bare-html regex uses a newline
// before `{` so it can't accidentally match the attribute-selector block.
const darkBg   = tokenFrom('html', 'bg');
const darkInk  = tokenFrom('html', 'ink');
const darkSurf = tokenFrom('html', 'surface');
const lightBg   = tokenFrom('html[data-theme="light"]', 'bg');
const lightInk  = tokenFrom('html[data-theme="light"]', 'ink');
const lightSurf = tokenFrom('html[data-theme="light"]', 'surface');

// The four selectable accents — parsed from the ACCENTS map in tweaks.js.
function accentsFromTweaks() {
  // Match the ACCENTS object literal body.
  const m = tweaksJs.match(/ACCENTS\s*=\s*\{([\s\S]*?)\}/);
  assert.ok(m, 'could not find the ACCENTS map in tweaks.js');
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/(\w+)\s*:\s*"([^"]+)"/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}
const ACCENTS = accentsFromTweaks();

// ── colour resolution ───────────────────────────────────────────────────
/** Parse any CSS colour string (hex or oklch) into a culori colour object. */
function color(str) {
  const c = parse(str);
  assert.ok(c, `culori failed to parse colour "${str}"`);
  return c;
}

/**
 * Resolve --accent-fg for one accent in one theme, mirroring the CSS:
 *   dark   → --accent-fg: var(--accent)
 *   light  → --accent-fg: color-mix(in oklch, var(--accent), var(--ink) 68%)
 * CSS color-mix with a 68% weight on the second colour == interpolating from
 * accent (t=0) to ink (t=1) at t=0.68, in the oklch space.
 */
function accentFg(accentStr, theme) {
  const accent = color(accentStr);
  if (theme === 'dark') return accent;
  const ink = color(lightInk);
  return interpolate([accent, ink], 'oklch')(0.68);
}

const ratio = (fg, bg) => wcagContrast(color2(fg), color2(bg));
// wcagContrast accepts colour objects or strings; normalize to objects.
function color2(c) { return typeof c === 'string' ? color(c) : c; }

// ── tests ───────────────────────────────────────────────────────────────
test('the four selectable accents were parsed from tweaks.js', () => {
  assert.deepEqual(Object.keys(ACCENTS).sort(), ['blue', 'green', 'pink', 'warm']);
});

const THEMES = [
  { name: 'dark',  bg: () => darkBg,  surf: () => darkSurf,  ink: () => darkInk },
  { name: 'light', bg: () => lightBg, surf: () => lightSurf, ink: () => lightInk },
];

for (const theme of THEMES) {
  for (const [accentName, accentStr] of Object.entries(ACCENTS)) {
    test(`--accent-fg (${accentName}) clears 4.5:1 on ${theme.name} --bg`, () => {
      const fg = accentFg(accentStr, theme.name);
      const r = ratio(fg, theme.bg());
      assert.ok(r >= 4.5,
        `${theme.name}/${accentName} accent-fg on --bg is ${r.toFixed(2)}:1 (need >=4.5)`);
    });

    test(`--accent-fg (${accentName}) clears 4.5:1 on ${theme.name} --surface`, () => {
      const fg = accentFg(accentStr, theme.name);
      const r = ratio(fg, theme.surf());
      assert.ok(r >= 4.5,
        `${theme.name}/${accentName} accent-fg on --surface is ${r.toFixed(2)}:1 (need >=4.5)`);
    });
  }

  test(`--focus clears 3:1 on ${theme.name} --bg and --surface`, () => {
    // --focus is var(--ink) in both themes.
    const focus = theme.ink();
    const onBg   = ratio(focus, theme.bg());
    const onSurf = ratio(focus, theme.surf());
    assert.ok(onBg >= 3,
      `${theme.name} --focus on --bg is ${onBg.toFixed(2)}:1 (need >=3)`);
    assert.ok(onSurf >= 3,
      `${theme.name} --focus on --surface is ${onSurf.toFixed(2)}:1 (need >=3)`);
  });
}
