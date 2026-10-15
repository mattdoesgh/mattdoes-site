import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildFixtureVault, readDist } from './helpers/run-build.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function doc(rel) {
  return new JSDOM(readDist(distDir, rel)).window.document;
}

test('homepage is an editorial projection rather than the exhaustive timeline', () => {
  const d = doc('index.html');
  assert.ok(d.querySelector('.home-lead h2 a[href="/journal/reader-features-fixture/"]'));
  assert.ok(d.querySelector('.home-content > .home-recent'));
  assert.equal(d.querySelector('.side-left'), null);
  assert.equal(d.querySelector('.side-right'), null);
  assert.equal(d.querySelector('[data-timeline-controls]'), null);
  assert.equal(d.querySelector('main')?.firstElementChild?.classList.contains('home-content'), true,
    'the primary reading path should be the first thing in the main landmark');
});

test('the homepage shelf does not promote posts or thoughts', () => {
  const d = doc('index.html');
  assert.equal(d.querySelector('.home-shelves a[href="/posts/"]'), null);
  assert.equal(d.querySelector('.home-shelves a[href="/thoughts/"]'), null);
  assert.ok(d.querySelector('.home-shelves a[href="/blog/"]'));
  assert.ok(d.querySelector('.home-shelves a[href="/listening/"]'));
});

test('Topic paths connect journal and making, not the retired notebook', () => {
  const topic = doc('topics/meta/index.html');
  const kinds = [...topic.querySelectorAll('.topic-entry .kind')].map(node => node.textContent.trim());
  assert.ok(kinds.includes('journal'));
  assert.equal(kinds.includes('thought'), false);
  assert.equal(topic.querySelector('a[href^="/thoughts/"]'), null);

  const article = doc('journal/hello-fixture-world/index.html');
  assert.ok(article.querySelector('.post-tags a[href="/topics/meta/"]'));
  assert.ok(article.querySelector('.post-tags a[href="/topics/ci/"]'));

  const sitemap = readDist(distDir, 'sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/mattdoes\.online\/topics\/meta\/<\/loc>/);
});
