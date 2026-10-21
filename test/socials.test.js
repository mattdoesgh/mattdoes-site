// Footer socials come from the registry and appear on every built page.
// Profile URLs stay out of the page body. They belong in this footer only.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, listDistHtml } from './helpers/run-build.js';
import { socials, validateSocials } from '../site/verbs.ts';

const EXPECTED = [
  { label: 'instagram', href: 'https://www.instagram.com/mattdoes.ig/' },
  { label: 'letterboxd', href: 'https://letterboxd.com/mattdoes/' },
  { label: 'last.fm', href: 'https://www.last.fm/user/djverism' },
  { label: 'github', href: 'https://github.com/mattdoesgh' },
];

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

test('the registry lists the four socials', () => {
  assert.deepEqual(socials.map((item) => ({ label: item.label, href: item.href })), EXPECTED);
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

test('every built page footer has the four social hrefs', () => {
  const files = listDistHtml(distDir);
  assert.ok(files.length >= 4);
  for (const file of files) {
    const rel = path.relative(distDir, file);
    const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
    const footer = doc.querySelector('footer.site-footer');
    assert.ok(footer, rel);
    const links = [...footer.querySelectorAll('nav.socials a')];
    assert.deepEqual(links.map((anchor) => ({
      label: anchor.textContent,
      href: anchor.getAttribute('href'),
      rel: anchor.getAttribute('rel'),
      target: anchor.getAttribute('target'),
    })), EXPECTED.map((item) => ({
      label: item.label,
      href: item.href,
      rel: 'me noopener',
      target: null,
    })), rel);
    for (const anchor of links) {
      assert.equal(anchor.textContent.includes('@'), false, rel);
      assert.equal(/https?:/i.test(anchor.textContent), false, rel);
      assert.equal(String(anchor.getAttribute('href')).includes('/unshared'), false, rel);
    }
  }
});
