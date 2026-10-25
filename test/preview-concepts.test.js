// /concepts/ is a preview-only page. Production and local builds leave it out.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyConceptsForPreview, pagesPreviewRequested } from '../lib/preview-concepts.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tempDist(headers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'concepts-preview-'));
  if (headers != null) fs.writeFileSync(path.join(dir, '_headers'), headers);
  return dir;
}

test('pages preview is requested only for a non-production Pages branch', () => {
  assert.equal(pagesPreviewRequested({}), false);
  assert.equal(pagesPreviewRequested({ CF_PAGES: '1' }), false);
  assert.equal(pagesPreviewRequested({
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'main',
    CF_PAGES_PRODUCTION_BRANCH: 'main',
  }), false);
  assert.equal(pagesPreviewRequested({
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'cursor/unshared-experiments-concepts',
    CF_PAGES_PRODUCTION_BRANCH: '',
  }), false);
  assert.equal(pagesPreviewRequested({
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'cursor/unshared-experiments-concepts',
    CF_PAGES_PRODUCTION_BRANCH: 'main',
  }), true);
});

test('copy stays out of dist unless this is a preview branch', () => {
  const dir = tempDist('/*\n  X-Frame-Options: DENY\n');
  assert.equal(copyConceptsForPreview(dir, {}), false);
  assert.equal(fs.existsSync(path.join(dir, 'concepts')), false);
  assert.equal(copyConceptsForPreview(dir, {
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'main',
    CF_PAGES_PRODUCTION_BRANCH: 'main',
  }), false);
  assert.equal(fs.existsSync(path.join(dir, 'concepts')), false);
});

test('preview copy retargets the stylesheet and marks the path noindex', () => {
  const dir = tempDist('/*\n  X-Frame-Options: DENY\n');
  const env = {
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'cursor/unshared-experiments-concepts',
    CF_PAGES_PRODUCTION_BRANCH: 'main',
  };
  assert.equal(copyConceptsForPreview(dir, env, REPO_ROOT), true);
  const css = fs.readFileSync(path.join(dir, 'concepts', 'unshared.css'), 'utf8');
  assert.match(css, /@import "\.\/tokens\.css";/);
  assert.match(css, /url\("\/fonts\/Anton-latin\.woff2"\)/);
  assert.doesNotMatch(css, /\.\.\/site\/tokens\.css/);
  assert.doesNotMatch(css, /\.\.\/static\/fonts/);
  assert.equal(
    fs.readFileSync(path.join(dir, 'concepts', 'tokens.css'), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, 'site', 'tokens.css'), 'utf8'),
  );
  const html = fs.readFileSync(path.join(dir, 'concepts', 'index.html'), 'utf8');
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /id="field"/);
  const js = fs.readFileSync(path.join(dir, 'concepts', 'unshared.js'), 'utf8');
  assert.match(js, /AudioContext/);
  const headers = fs.readFileSync(path.join(dir, '_headers'), 'utf8');
  assert.match(headers, /\/concepts\/\*\n {2}X-Robots-Tag: noindex\n/);
  assert.equal(copyConceptsForPreview(dir, env, REPO_ROOT), true);
  const again = fs.readFileSync(path.join(dir, '_headers'), 'utf8');
  assert.equal(again.split('/concepts/*').length, 2);
});
