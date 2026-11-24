// The home ether: the verb menu is the prompt inside the hero, and the
// spell line exists only once the script runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { renderHome } from '../site/render.js';
import { REPO_ROOT } from './helpers/run-build.js';

const assets = { 'station.css': 'station.abc12345.css', 'station.js': 'station.abc12345.js', 'hero.css': 'hero.abc12345.css', 'hero.js': 'hero.abc12345.js' };

function home() {
  return new JSDOM(renderHome({ siteUrl: 'https://mattdoes.online', assets, watches: [], tracks: [] })).window.document;
}

test('the verb menu is the prompt inside the hero', () => {
  const doc = home();
  const nav = doc.querySelector('[data-hero] .hero-pin > nav.hero-prompt[aria-label="verbs"]');
  assert.ok(nav);
  assert.equal(nav.querySelector('a.verb')?.getAttribute('href'), '/watching/');
  assert.equal(nav.querySelector('.home-suno-sign a')?.getAttribute('href'), '/unshared/');
  assert.equal(doc.querySelector('[data-hero] .hero-log')?.getAttribute('aria-hidden'), 'true');
});

test('the server page has no spell field', () => {
  const doc = home();
  assert.equal(doc.querySelector('input'), null);
  assert.equal(doc.querySelector('.spell-out'), null);
});

test('hero.js keeps typed words in the page and summons at random', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'hero.js'), 'utf8');
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|innerHTML/);
  assert.match(src, /crypto\.getRandomValues/);
  assert.match(src, /textContent/);
});

test('the water line fraction matches the token', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'hero.js'), 'utf8');
  const tokens = fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8');
  const line = Number(tokens.match(/--hero-line:\s*([\d.]+)%/)[1]) / 100;
  assert.match(src, new RegExp(`var LINE = ${line};`));
});

function ward() {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'hero.js'), 'utf8');
  const from = src.indexOf('  /* The ward.');
  const to = src.indexOf('  /* The verb links summon, then open. */');
  assert.ok(from > 0 && to > from);
  const atob = (s) => Buffer.from(s, 'base64').toString('binary');
  return new Function('window', src.slice(from, to) + '; return cursed;')({ atob });
}

test('the ward refuses slurs and profanity, tricks included', () => {
  const cursed = ward();
  const refused = ["bjFnZzNy","Zi51LmMuaw==","ZnV1dXVjaw==","cyBoIGkgdA==","Y8O6bnQ=","QjFUQ0hFUw==","cjRwaXN0","c2ghdGhlYWQ=","bW90aGVyZnVja2Vycw==","d2gwcmU="].map((s) => Buffer.from(s, 'base64').toString());
  for (const word of refused) assert.equal(cursed(word), true);
});

test('the ward lets innocent words through', () => {
  const cursed = ward();
  const spared = ['class', 'scunthorpe', 'grape', 'torpedo', 'analysis', 'japan', 'montenegro', 'shoe', 'ashkenazi', 'assess', 'niger', 'shiitake', 'therapist', 'cocktail', 'pakistan', 'raccoon', 'summon', 'take me home'];
  for (const word of spared) assert.equal(cursed(word), false, word);
});

test('a refused word never reaches the scene', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'static', 'hero.js'), 'utf8');
  assert.match(src, /if \(cursed\(word\)\)/);
  assert.match(src, /r\.refused = true;/);
});
