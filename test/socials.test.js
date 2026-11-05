// Footer socials come from the registry and appear on every built page
// outside /unshared/. Those hrefs stay in the footer.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml } from './helpers/run-build.js';
import { socials, lastfmSocialEnabled, validateSocials } from '../site/verbs.ts';
import { socialIcon } from '../site/social-icons.js';

const EXPECTED = [
  { label: 'x', href: 'https://x.com/mattdoes' },
  { label: 'instagram', href: 'https://www.instagram.com/mattdoes.ig/' },
  { label: 'letterboxd', href: 'https://letterboxd.com/mattdoes/' },
  { label: 'github', href: 'https://github.com/mattdoesgh' },
];

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('the registry lists the footer socials without last.fm', () => {
  assert.equal(lastfmSocialEnabled, false);
  assert.deepEqual(socials.map((item) => ({ label: item.label, href: item.href })), EXPECTED);
  assert.equal(socialIcon('last.fm').includes('<svg'), true);
  for (const item of EXPECTED) {
    const icon = socialIcon(item.label);
    assert.match(icon, /^<svg viewBox="0 0 24 24" aria-hidden="true"><path d="[^"]+"\/><\/svg>$/);
    assert.doesNotMatch(icon, /https?:|simpleicons|unpkg|jsdelivr|fontawesome/i);
  }
  assert.throws(() => socialIcon('missing'), /missing icon/);
  assert.doesNotThrow(() => validateSocials(socials));
  assert.throws(() => validateSocials([
    { label: 'Instagram', href: 'https://www.instagram.com/mattdoes.ig/' },
  ]), /invalid label/);
  assert.throws(() => validateSocials([
    { label: 'github', href: 'https://github.com/mattdoesgh' },
    { label: 'github', href: 'https://github.com/mattdoesgh' },
  ]), /duplicate label/);
  assert.throws(() => validateSocials([
    { label: 'unshared', href: 'https://mattdoes.online/unshared/' },
  ]), /must not point at unshared/);
});

test('the home last.fm verb still opens /listening/', () => {
  const home = new JSDOM(fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')).window.document;
  const link = [...home.querySelectorAll('a.verb')].find((anchor) => anchor.getAttribute('href') === '/listening/');
  assert.equal(link?.querySelector('.verb-label')?.textContent, 'last.fm');
  assert.equal(fs.existsSync(path.join(distDir, 'listening', 'index.html')), true);
});

test('every built page footer has the social hrefs and names', () => {
  const files = listDistHtml(distDir);
  assert.ok(files.length >= 4);
  for (const file of files) {
    const rel = path.relative(distDir, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    const doc = new JSDOM(html).window.document;
    if (rel.startsWith('unshared/')) {
      assert.equal(doc.querySelector('footer.site-footer'), null, rel);
      assert.equal(doc.querySelector('.outlinks'), null, rel);
      assert.equal(html.includes('mailto:'), false, rel);
      assert.doesNotMatch(html, /music\.apple\.com|spotify\.com|bandcamp\.com/i, rel);
      if (rel === 'unshared/index.html') {
        assert.equal(doc.querySelector('a.profile'), null, rel);
        assert.equal(html.includes('https://suno.com/@unshared'), false, rel);
        assert.match(html, /href="https:\/\/suno\.com\/song\/[0-9a-f-]{36}"/, rel);
      } else {
        assert.equal(html.includes('suno.com'), false, rel);
      }
      continue;
    }
    assert.equal(html.includes('suno.com'), false, rel);
    const footer = doc.querySelector('footer.site-footer');
    assert.ok(footer, rel);
    const links = [...footer.querySelectorAll('nav.socials a')];
    assert.deepEqual(links.map((anchor) => ({
      label: anchor.getAttribute('aria-label'),
      href: anchor.getAttribute('href'),
      rel: anchor.getAttribute('rel'),
      target: anchor.getAttribute('target'),
    })), EXPECTED.map((item) => ({
      label: item.label,
      href: item.href,
      rel: 'me noopener',
      target: null,
    })), rel);
    assert.equal(footer.querySelector('nav.verb-nav'), null, rel);
    assert.equal(footer.querySelector('.home-link'), null, rel);
    assert.equal(footer.textContent.includes('matt does'), false, rel);
    assert.equal(footer.innerHTML.includes('https://www.last.fm/user/djverism'), false, rel);
    if (rel !== 'index.html') {
      assert.equal(doc.querySelector('h1 a')?.getAttribute('href'), '/', rel);
    }
    for (const anchor of links) {
      assert.equal(anchor.textContent.trim(), '', rel);
      assert.equal(anchor.querySelectorAll('svg').length, 1, rel);
      assert.equal(anchor.querySelector('svg')?.getAttribute('aria-hidden'), 'true', rel);
      assert.equal(/https?:/i.test(anchor.querySelector('svg').innerHTML), false, rel);
      assert.equal(String(anchor.getAttribute('href')).includes('/unshared'), false, rel);
    }
  }
});
