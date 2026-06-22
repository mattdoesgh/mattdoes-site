// Audit backlog: "Accessibility" (media side). Covers audit finding #15 —
// image/media rendering: alt-text handling, decorative embeds, eager-loading
// the first (likely-LCP) image, and the missing-alt build warning.
//
// Builds a media fixture vault and asserts on the generated markup.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { runBuild, readDist, REPO_ROOT } from './helpers/run-build.js';

const MEDIA_VAULT = path.join(REPO_ROOT, 'test', 'fixtures', 'media');
const MEDIA_MANIFEST = path.join(REPO_ROOT, 'test', 'fixtures', 'media', 'media-manifest.json');

let buildResult;
let mediaDoc;
let mediaHtml;

test.before(() => {
  buildResult = runBuild({ vaultDir: MEDIA_VAULT, mediaManifest: MEDIA_MANIFEST });
  if (buildResult.status !== 0) {
    throw new Error(`media fixture build failed:\n${buildResult.stderr}`);
  }
  mediaHtml = readDist(buildResult.distDir, 'journal/media-post/index.html');
  mediaDoc = new JSDOM(mediaHtml).window.document;
});

test('a captioned image renders inside a <figure> with a <figcaption>', () => {
  const figure = mediaDoc.querySelector('figure');
  assert.ok(figure, 'an authored-caption embed must render a <figure>');
  const cap = figure.querySelector('figcaption');
  assert.ok(cap && cap.textContent.includes('test landscape'),
    'the <figcaption> must carry the authored caption');
  const img = figure.querySelector('img');
  assert.equal(img.getAttribute('alt'), 'A sweeping view of the test landscape',
    'a captioned image must use the caption as alt text');
});

test('a decorative embed (empty pipe) renders alt="" with no figcaption', () => {
  const decorative = [...mediaDoc.querySelectorAll('img')]
    .find(img => img.getAttribute('src')?.includes('divider.png'));
  assert.ok(decorative, 'the decorative image should be in the output');
  assert.equal(decorative.getAttribute('alt'), '',
    'a ![[img|]] decorative embed must render alt=""');
  // It must NOT be wrapped in a captioned <figure>.
  assert.notEqual(decorative.parentElement.tagName, 'FIGURE',
    'a decorative image must not get a <figcaption>');
});

test('the first image in a note is eager-loaded with high fetch priority', () => {
  const firstImg = mediaDoc.querySelector('img');
  assert.equal(firstImg.getAttribute('loading'), 'eager',
    'the first (likely-LCP) image must be eager-loaded');
  assert.equal(firstImg.getAttribute('fetchpriority'), 'high',
    'the first image should hint high fetch priority');
});

test('the hero image reserves layout space with intrinsic dimensions', () => {
  const hero = mediaDoc.querySelector('img[src*="hero.jpg"]');
  assert.ok(hero, 'hero.jpg must render as an <img>');
  assert.equal(hero.getAttribute('width'), '1200',
    'optimize-media manifest width must reach the <img> for CLS');
  assert.equal(hero.getAttribute('height'), '800',
    'optimize-media manifest height must reach the <img> for CLS');
});

test('images with webp variants render inside <picture> with a webp <source>', () => {
  const heroPicture = mediaDoc.querySelector('picture');
  assert.ok(heroPicture, 'a variant-backed image must render a <picture>');
  const webp = heroPicture.querySelector('source[type="image/webp"]');
  assert.ok(webp, 'the <picture> must include a webp <source>');
  assert.match(webp.getAttribute('srcset') || '', /hero\.webp/,
    'the webp source must point at the optimized variant');

  const diagram = [...mediaDoc.querySelectorAll('img')]
    .find(img => img.getAttribute('src')?.includes('diagram.png'));
  assert.ok(diagram, 'diagram.png must render');
  assert.equal(diagram.getAttribute('width'), '400',
    'later images still carry intrinsic dimensions from the manifest');
  assert.equal(diagram.getAttribute('height'), '300');
  assert.equal(diagram.getAttribute('loading'), 'lazy');
});

test('later images are lazy-loaded', () => {
  const imgs = [...mediaDoc.querySelectorAll('img')];
  assert.ok(imgs.length >= 2, 'fixture should have multiple images');
  // Every image after the first must be lazy.
  for (const img of imgs.slice(1)) {
    assert.equal(img.getAttribute('loading'), 'lazy',
      `non-hero image ${img.getAttribute('src')} must be lazy-loaded`);
  }
});

test('a bare image embed emits a missing-alt build warning', () => {
  // ![[diagram.png]] has no pipe → informative image with no authored alt.
  const combined = `${buildResult.stdout}\n${buildResult.stderr}`;
  assert.match(combined, /image embed lacks alt text.*diagram\.png/,
    'the build must warn when an informative image lacks authored alt text');
});

test('audio and video embeds render native media elements with controls', () => {
  const audio = mediaDoc.querySelector('audio');
  assert.ok(audio && audio.hasAttribute('controls'),
    'an audio embed must render <audio controls>');
  const video = mediaDoc.querySelector('video');
  assert.ok(video && video.hasAttribute('controls'),
    'a video embed must render <video controls>');
});
