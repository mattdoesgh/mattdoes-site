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

test('/thoughts/ groups fragments by source day and keeps stable anchors', () => {
  const d = doc('thoughts/index.html');
  const days = d.querySelectorAll('.notebook-day');
  assert.equal(days.length, 1);
  assert.equal(days[0].querySelectorAll('.row--thought').length, 2);
  assert.ok(days[0].querySelector('#t-20260102-0915'));
  assert.ok(days[0].querySelector('#t-20260102-1402'));
  assert.doesNotMatch(d.body.textContent, /daily\/2026-01-02\.md/,
    'vault provenance must remain implementation data');
  assert.equal(d.querySelector('main')?.firstElementChild?.classList.contains('notebook'), true,
    'notebook content should be the complete primary content path');
});

test('Topic paths connect articles and Thoughts across writing kinds', () => {
  const topic = doc('topics/meta/index.html');
  const kinds = [...topic.querySelectorAll('.topic-entry .kind')].map(node => node.textContent.trim());
  assert.ok(kinds.includes('journal'));
  assert.ok(kinds.includes('thought'));
  assert.ok(topic.querySelector('a[href="/thoughts/#t-20260102-1402"]'));

  const article = doc('journal/hello-fixture-world/index.html');
  assert.ok(article.querySelector('.post-tags a[href="/topics/meta/"]'));
  assert.ok(article.querySelector('.post-tags a[href="/topics/ci/"]'));

  const sitemap = readDist(distDir, 'sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/mattdoes\.online\/topics\/meta\/<\/loc>/);
});
