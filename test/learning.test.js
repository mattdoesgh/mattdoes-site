// /learning/ is published beside the home menu. learningOnHome false leaves
// `/` on the verb list. The arrays lesson can be stepped without a solution.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import { buildFixtureVault, listDistHtml, readDist, REPO_ROOT } from './helpers/run-build.js';
import { learningOnHome, sitemapPaths, verbs } from '../site/verbs.ts';
import { learningHomeRow } from '../site/render.js';
import { learningTracks, publishedLearningPaths } from '../learning/curriculum.js';
import { renderLearningHub } from '../learning/hub.js';
import { renderArraysDocument } from '../learning/arrays-page.js';
import { bootLesson } from '../learning/arrays/arrays.js';
import {
  binarySteps,
  duplicateActions,
  growthResult,
  linearSteps,
  searchData,
  appendFrames,
} from '../learning/model.js';
import { loadTokens, violationsInCss, violationsInSource } from '../lib/design-tokens.js';

let distDir;
test.before(() => { ({ distDir } = buildFixtureVault()); });

function lessonLabels() {
  return learningTracks.flatMap((track) => track.lessons);
}

test('the home menu stays on the verbs while learning is published', () => {
  assert.equal(learningOnHome, false);
  assert.deepEqual(verbs.map((verb) => verb.slug), ['watching', 'listening']);
  assert.equal(learningHomeRow(false), '');
  assert.match(learningHomeRow(true), /href="\/learning\/"/);
  assert.equal(new JSDOM(learningHomeRow(true)).window.document.querySelector('a')?.textContent, 'matt does learning');
  const home = readDist(distDir, 'index.html');
  const homeDoc = new JSDOM(home).window.document;
  assert.equal(homeDoc.querySelector('a[href="/learning/"]'), null);
  assert.equal(homeDoc.querySelector('a[href="/learning/arrays/"]'), null);
  assert.equal(fs.existsSync(path.join(distDir, 'learning', 'index.html')), true);
  assert.equal(fs.existsSync(path.join(distDir, 'learning', 'arrays', 'index.html')), true);
  assert.equal(fs.existsSync(path.join(distDir, 'learning', 'learning.css')), true);
  assert.equal(fs.existsSync(path.join(distDir, 'learning', 'arrays', 'arrays.js')), true);
  assert.equal(fs.existsSync(path.join(distDir, 'learning', 'model.js')), true);
  const stationCss = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.css'), 'utf8');
  const stationJs = fs.readFileSync(path.join(REPO_ROOT, 'static', 'station.js'), 'utf8');
  assert.equal(stationCss.includes('lesson-next'), false);
  assert.equal(stationJs.includes('data-lesson'), false);
  const shippedCss = fs.readFileSync(path.join(distDir, 'learning', 'learning.css'), 'utf8');
  assert.match(shippedCss, /@import "\/learning\/tokens\.css";/);
  assert.match(shippedCss, /url\("\/fonts\/Anton-latin\.woff2"\)/);
  assert.equal(shippedCss.includes('../site/'), false);
  assert.equal(shippedCss.includes('../static/'), false);
});

test('the curriculum is ordered, with one open lesson and none done', () => {
  assert.deepEqual(learningTracks.map((track) => track.label), [
    'data structures',
    'operating systems',
    'ai systems',
  ]);
  const lessons = lessonLabels();
  assert.equal(lessons.some((lesson) => lesson.status === 'done'), false);
  const open = lessons.filter((lesson) => lesson.status === 'open');
  assert.deepEqual(open.map((lesson) => lesson.label), ['arrays & big-o']);
  assert.deepEqual(publishedLearningPaths(), ['/learning/', '/learning/arrays/']);
  assert.equal(sitemapPaths().some((route) => route.startsWith('/learning/')), false);
  const sitemap = readDist(distDir, 'sitemap.xml');
  assert.equal(sitemap.includes('/learning/'), false);
  const hub = new JSDOM(renderLearningHub('https://mattdoes.online')).window.document;
  const rows = [...hub.querySelectorAll('.lesson-row')];
  assert.deepEqual(rows.map((row) => row.textContent), lessons.map((lesson) => lesson.label));
  for (const lesson of lessons) {
    const row = rows.find((item) => item.textContent === lesson.label);
    const link = row.querySelector('a');
    if (lesson.status === 'next') {
      assert.equal(link, null, lesson.label);
      assert.equal(row.querySelector('.lesson-next')?.textContent, lesson.label);
    } else {
      assert.equal(link?.getAttribute('href'), `/learning/${lesson.slug}/`, lesson.label);
    }
  }
  assert.equal(hub.querySelector('h1')?.textContent, 'matt does learning');
  assert.equal(hub.querySelector('h1 a')?.getAttribute('href'), '/');
  assert.equal(hub.querySelector('body')?.getAttribute('data-polarity'), 'flip');
  assert.equal(hub.querySelector('a.skip-link')?.getAttribute('href'), '#main');
  assert.equal(hub.querySelectorAll('main#main').length, 1);
  assert.ok(hub.querySelector('footer .socials a[rel="me noopener"]'));
});

test('contains duplicate, append, and search counts match the lesson', () => {
  assert.equal(duplicateActions('duplicate', 'pairs').length, 22);
  assert.equal(duplicateActions('distinct', 'pairs').length, 28);
  assert.equal(duplicateActions('duplicate', 'set').length, 8);
  assert.equal(duplicateActions('distinct', 'set').length, 8);
  assert.equal(duplicateActions('duplicate', 'pairs').at(-1).same, true);
  assert.equal(duplicateActions('distinct', 'pairs').some((step) => step.same), false);
  const frames = appendFrames();
  assert.deepEqual(frames.filter((frame) => frame.kind === 'copy').map((frame) => frame.capacity), [2, 4, 8]);
  assert.deepEqual(frames.at(-1).slots.slice(0, 5), [10, 20, 40, 80, 160]);
  const data = searchData();
  assert.equal(data.length, 334);
  assert.equal(linearSteps(data, 999).length, 334);
  assert.equal(linearSteps(data, 999).at(-1).index, 333);
  assert.equal(linearSteps(data, 1000).some((step) => step.found), false);
  assert.equal(binarySteps(data, 999).at(-1).next, 'found');
  assert.equal(binarySteps(data, 999).at(-1).value, 999);
  assert.equal(binarySteps(data, 1000).some((step) => step.next === 'found'), false);
  assert.equal(growthResult('10-100').right, true);
  assert.equal(growthResult('10-10').right, false);
  assert.match(growthResult('10-100').text, /10 times/);
  assert.match(growthResult('10-100').text, /100 times/);
});

test('the arrays page steps, reveals hints, and checks growth without solution code', () => {
  const html = renderArraysDocument('https://mattdoes.online');
  assert.equal(html.includes('style='), false);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/);
  assert.match(html, /src="\.\/arrays\.js"/);
  assert.match(html, /class DynamicArray:/);
  assert.match(html, /def linear_search/);
  assert.match(html, /def binary_search/);
  assert.match(html, /https:\/\/leetcode\.com\/problems\/contains-duplicate\//);
  assert.match(html, /rel="noopener noreferrer"/);
  const coach = html.slice(html.indexOf('id="coach"'));
  assert.equal(coach.includes('containsDuplicate'), false);
  assert.equal(coach.includes('return True'), false);
  assert.equal(coach.includes('nums'), false);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://mattdoes.online/learning/arrays/' });
  const { document } = dom.window;
  bootLesson(document);
  const duplicate = document.querySelector('[data-stepper="duplicate"]');
  const stepDup = () => duplicate.querySelector('[data-act="step"]').click();
  const dupCount = () => duplicate.querySelector('[data-count]').textContent;
  const dupOutcome = () => duplicate.querySelector('[data-outcome]').textContent;
  assert.equal(dupCount(), '0 checks');
  stepDup();
  assert.equal(dupCount(), '1 checks');
  assert.match(dupOutcome(), /differ/);
  duplicate.querySelector('[data-act="back"]').click();
  assert.equal(dupCount(), '0 checks');
  for (let i = 0; i < 22; i += 1) stepDup();
  assert.equal(dupCount(), '22 checks');
  assert.match(dupOutcome(), /duplicate/);
  stepDup();
  assert.equal(dupCount(), '22 checks');

  const distinct = duplicate.querySelector('input[value="distinct"]');
  distinct.checked = true;
  distinct.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(dupCount(), '0 checks');
  for (let i = 0; i < 28; i += 1) stepDup();
  assert.equal(dupCount(), '28 checks');
  assert.doesNotMatch(dupOutcome(), /duplicate/);

  const duplicateSample = duplicate.querySelector('input[name="dup-sample"][value="duplicate"]');
  duplicateSample.checked = true;
  duplicateSample.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const setMode = duplicate.querySelector('input[name="dup-approach"][value="set"]');
  setMode.checked = true;
  setMode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  for (let i = 0; i < 8; i += 1) stepDup();
  assert.equal(dupCount(), '8 checks');
  assert.match(dupOutcome(), /already in seen/);
  assert.equal(duplicate.querySelector('[data-seen]').hasAttribute('hidden'), false);

  const array = document.querySelector('[data-stepper="array"]');
  const stepArray = () => array.querySelector('[data-act="step"]').click();
  assert.match(array.querySelector('[data-count]').textContent, /capacity 1/);
  assert.equal(array.querySelector('[data-target]').hasAttribute('hidden'), true);
  const appendValues = () => [...array.querySelectorAll('[data-panel="append"] .cell-value')].map((el) => el.textContent);
  for (let i = 0; i < 12 && !appendValues().includes('160'); i += 1) stepArray();
  assert.match(array.querySelector('[data-count]').textContent, /capacity 8/);
  assert.ok(appendValues().includes('160'));

  const insert = array.querySelector('input[name="array-mode"][value="insert"]');
  insert.checked = true;
  insert.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  for (let i = 0; i < 8 && !array.querySelector('[data-outcome]').textContent.includes('10, 20, 30, 40'); i += 1) {
    stepArray();
  }
  assert.match(array.querySelector('[data-outcome]').textContent, /10, 20, 30, 40/);

  const binary = array.querySelector('input[value="binary"]');
  binary.checked = true;
  binary.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(array.querySelector('[data-target]').hasAttribute('hidden'), false);
  assert.match(array.querySelector('[data-outcome]').textContent, /range\(0, 1000, 3\)/);
  assert.match(array.querySelector('[data-count]').textContent, /^\d+ slots$/);
  const binaryReads = binarySteps(searchData(), 999).length;
  for (let i = 0; i < binaryReads; i += 1) stepArray();
  assert.match(array.querySelector('[data-outcome]').textContent, /999/);
  assert.equal(array.querySelector('[data-count]').textContent, `${binaryReads} reads`);

  const missing = array.querySelector('input[value="1000"]');
  missing.checked = true;
  missing.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const linear = array.querySelector('input[value="linear"]');
  linear.checked = true;
  linear.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.match(array.querySelector('[data-outcome]').textContent, /range\(0, 1000, 3\): 334 numbers/);
  assert.match(array.querySelector('[data-outcome]').textContent, /1000 is missing/);
  assert.equal(array.querySelector('[data-count]').textContent, '334 slots');
  const linearReads = linearSteps(searchData(), 1000).length;
  for (let i = 0; i < linearReads + 1; i += 1) stepArray();
  assert.match(array.querySelector('[data-outcome]').textContent, /not in the list/);
  array.querySelector('[data-act="reset"]').click();
  assert.equal(array.querySelector('[data-count]').textContent, '334 slots');
  assert.match(array.querySelector('[data-outcome]').textContent, /range\(0, 1000, 3\)/);

  const reveal = document.querySelector('[data-reveal]');
  assert.equal(document.querySelectorAll('[data-hint]:not([hidden])').length, 1);
  reveal.click();
  reveal.click();
  assert.equal(document.querySelectorAll('[data-hint]:not([hidden])').length, 3);
  assert.equal(reveal.hasAttribute('hidden'), true);
  const wrong = document.querySelector('input[name="growth"][value="10-10"]');
  wrong.checked = true;
  wrong.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.match(document.querySelector('[data-growth-result]').textContent, /^not quite\./);
  const right = document.querySelector('input[name="growth"][value="10-100"]');
  right.checked = true;
  right.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.match(document.querySelector('[data-growth-result]').textContent, /^right\./);
  assert.equal(document.querySelector('[style]'), null);
  const client = fs.readFileSync(path.join(REPO_ROOT, 'learning', 'arrays', 'arrays.js'), 'utf8');
  assert.doesNotMatch(client, /\.style\b/);
  assert.doesNotMatch(client, /setAttribute\(\s*['"]style['"]/);
});

test('titles go straight into the content and no page uses a deck', () => {
  const style = fs.readFileSync(path.join(REPO_ROOT, 'STYLE.md'), 'utf8');
  assert.match(style, /No subheading or standfirst/);
  const css = fs.readFileSync(path.join(REPO_ROOT, 'learning', 'learning.css'), 'utf8');
  assert.equal(css.includes('.deck'), false);
  const contentLine = new Set(['total', 'layout-live']);
  for (const file of listDistHtml(distDir)) {
    const rel = path.relative(distDir, file);
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(html.includes('class="deck"'), false, rel);
    const doc = new JSDOM(html).window.document;
    const mast = doc.querySelector('.mast');
    const afterMast = mast?.nextElementSibling;
    if (afterMast) {
      assert.notEqual(afterMast.tagName, 'P', rel);
      assert.equal(afterMast.classList.contains('deck'), false, rel);
    }
    for (const sign of doc.querySelectorAll('h1.sign')) {
      if (sign.closest('.mast')) continue;
      const next = sign.nextElementSibling;
      if (!next) continue;
      assert.equal(next.classList.contains('deck'), false, rel);
      if (next.tagName !== 'P') continue;
      const kept = [...next.classList].some((name) => contentLine.has(name));
      assert.equal(kept, true, rel);
    }
  }
  const hub = new JSDOM(readDist(distDir, 'learning/index.html')).window.document;
  assert.equal(hub.querySelector('h1.sign')?.nextElementSibling?.tagName, 'NAV');
  const lesson = new JSDOM(readDist(distDir, 'learning/arrays/index.html')).window.document;
  assert.equal(lesson.querySelector('.mast')?.nextElementSibling?.tagName, 'SECTION');
  assert.equal(lesson.querySelector('h2')?.nextElementSibling?.classList.contains('deck'), false);
});

test('learning sources stay inside the token set', () => {
  const tokens = loadTokens();
  for (const rel of ['learning/learning.css']) {
    const css = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(violationsInCss(css, rel, tokens), []);
    assert.equal(css.includes('env('), false);
  }
  for (const rel of [
    'learning/hub.js',
    'learning/shell.js',
    'learning/arrays-page.js',
    'learning/arrays/arrays.js',
    'learning/model.js',
    'learning/curriculum.js',
  ]) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.deepEqual(violationsInSource(source, rel, tokens), []);
  }
});
