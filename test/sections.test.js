// Section descriptor drift tests (lib/sections.js).
//
// The descriptor is the one table of section spellings, but two consumers
// can't import it (templates/rows.js is browser-shipped and may import only
// ./_helpers.js; design-system/ssg/ builds as a separate package), so their
// inline copies are pinned here. The build-level check is stronger still:
// the sitemap's <loc> set must equal the set of index.html pages actually
// written — a route added to Emit but not the sitemap (or vice versa)
// fails loudly instead of drifting.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SECTIONS } from '../lib/sections.js';
import { emptyState } from '../templates/rows.js';
import { buildFixtureVault, REPO_ROOT } from './helpers/run-build.js';

test('rows.js empty-state copy matches the Section descriptor', () => {
  for (const [kind, section] of Object.entries(SECTIONS)) {
    assert.ok(emptyState(kind).includes(section.emptyState),
      `emptyState('${kind}') must carry the descriptor copy`);
  }
});

test('design-system listening route matches the Section descriptor', () => {
  const ssgFile = path.join(REPO_ROOT, 'design-system', 'ssg', 'index.tsx');
  const ssg = fs.readFileSync(ssgFile, 'utf8');
  for (const [kind, section] of Object.entries(SECTIONS)) {
    assert.ok(ssg.includes(`${kind}: '${section.route}'`),
      `${path.relative(REPO_ROOT, ssgFile)} must map ${kind} → ${section.route}`);
  }
  assert.equal(ssg.includes("url: '/posts/'"), false, 'posts is not a generated page');
  assert.equal(ssg.includes("url: '/thoughts/'"), false, 'thoughts is not a generated page');
  assert.equal(ssg.includes("url: '/design/'"), false, 'design sketches are not generated pages');
});

test('sitemap <loc> set equals the index.html pages actually written', () => {
  const { status, stderr, distDir } = buildFixtureVault();
  assert.equal(status, 0, stderr);

  // Every dist directory containing an index.html, as a site-root route.
  const written = new Set();
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name === 'index.html') {
        written.add(`/${path.relative(distDir, dir).split(path.sep).filter(Boolean).join('/')}/`.replace('//', '/'));
      }
    }
  };
  walk(distDir);

  const sitemap = fs.readFileSync(path.join(distDir, 'sitemap.xml'), 'utf8');
  const listed = new Set(
    [...sitemap.matchAll(/<loc>https:\/\/mattdoes\.online(\/[^<]*)<\/loc>/g)].map(m => m[1]));

  assert.deepEqual([...listed].sort(), [...written].sort(),
    'sitemap routes must exactly match the written index.html pages');
});
