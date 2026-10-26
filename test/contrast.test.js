// Token contrast for the station palette. Pink on black and black on pink
// both clear WCAG AA. White on pink does not, so flipped pages use black type.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wcagContrast } from 'culori';

const css = fs.readFileSync(path.join(process.cwd(), 'static', 'station.css'), 'utf8');
const tokens = fs.readFileSync(path.join(process.cwd(), 'site', 'tokens.css'), 'utf8');

function block(source, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const match = source.match(re);
  assert.ok(match, selector);
  return match[1];
}

function props(body) {
  const map = new Map();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

function resolve(primary, fallback, name) {
  let value = primary.get(name) ?? fallback.get(name);
  for (let i = 0; i < 6; i += 1) {
    const match = value && value.match(/^var\((--[\w-]+)\)$/);
    if (!match) return value;
    value = primary.get(match[1]) ?? fallback.get(match[1]);
  }
  return value;
}

const root = props(block(tokens, ':root'));
const flip = props(block(tokens, 'body[data-polarity="flip"]'));

test('field and ink clear AA on both polarities', () => {
  const field = resolve(root, root, '--field');
  const ink = resolve(root, root, '--ink');
  const pink = resolve(root, root, '--pink');
  assert.equal(field.toLowerCase(), '#000000');
  assert.equal(ink.toLowerCase(), '#ffffff');
  assert.equal(pink.toLowerCase(), '#f7c8d8');
  assert.ok(wcagContrast(ink, field) >= 4.5, 'white on black');
  assert.ok(wcagContrast(pink, field) >= 4.5, 'pink on black');
  assert.equal(resolve(flip, root, '--field').toLowerCase(), '#f7c8d8');
  assert.equal(resolve(flip, root, '--ink').toLowerCase(), '#000000');
  assert.ok(wcagContrast(resolve(flip, root, '--ink'), resolve(flip, root, '--field')) >= 4.5, 'black on pink');
  assert.ok(wcagContrast('#ffffff', '#f7c8d8') < 4.5, 'white on pink is below AA');
  assert.ok(wcagContrast(resolve(root, root, '--focus'), field) >= 3);
  assert.ok(wcagContrast(resolve(flip, root, '--focus'), resolve(flip, root, '--field')) >= 3);
});

test('the field has no background grid', () => {
  assert.doesNotMatch(css, /linear-gradient|repeating-linear-gradient|background-image/);
  assert.doesNotMatch(tokens, /linear-gradient|repeating-linear-gradient|background-image/);
  assert.match(css, /background-color:\s*var\(--field\)/);
});
