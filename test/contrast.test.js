// Token contrast for the station palette. Pink on black and black on pink
// both clear WCAG AA. White on pink does not, so flipped pages use black type.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wcagContrast } from 'culori';

const css = fs.readFileSync(path.join(process.cwd(), 'static', 'station.css'), 'utf8');

function block(selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const match = css.match(re);
  assert.ok(match, selector);
  return match[1];
}

function prop(body, name) {
  const match = body.match(new RegExp(`${name}\\s*:\\s*([^;]+)`));
  assert.ok(match, name);
  return match[1].trim();
}

const root = block(':root');
const flip = block('body[data-polarity="flip"]');

test('field and ink clear AA on both polarities', () => {
  const field = prop(root, '--field');
  const ink = prop(root, '--ink');
  const signal = prop(root, '--signal');
  assert.ok(wcagContrast(ink, field) >= 4.5, 'white on black');
  assert.ok(wcagContrast(signal, field) >= 4.5, 'pink on black');
  assert.equal(prop(flip, '--field').toLowerCase(), '#f7c8d8');
  assert.equal(prop(flip, '--ink').toLowerCase(), '#000000');
  assert.ok(wcagContrast(prop(flip, '--ink'), prop(flip, '--field')) >= 4.5, 'black on pink');
  assert.ok(wcagContrast('#ffffff', '#f7c8d8') < 4.5, 'white on pink is below AA');
  assert.ok(wcagContrast(prop(root, '--focus'), field) >= 3);
  assert.ok(wcagContrast(prop(flip, '--focus'), prop(flip, '--field')) >= 3);
});

test('the field has no background grid', () => {
  assert.doesNotMatch(css, /linear-gradient|repeating-linear-gradient|background-image/);
  assert.match(css, /background-color:\s*var\(--field\)/);
});
