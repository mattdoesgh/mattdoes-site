// Audit backlog: "Build input validation — Invalid and duplicate
// slug/frontmatter negative fixtures". Covers audit finding #2.
//
// Each NEGATIVE fixture under test/fixtures/ is a tiny standalone vault that
// trips exactly one build-time guard. We run build.js as a subprocess with
// VAULT_DIR pointed at it and assert a NON-ZERO exit plus an error message
// that names the offending note (so an author can find it).
//
// The positive case asserts the canonical fixture-vault still builds clean.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runBuild, buildFixtureVault, REPO_ROOT } from './helpers/run-build.js';

const fixturePath = (name) => path.join(REPO_ROOT, 'test', 'fixtures', name);

// Each row: [fixture dir, offending note filename, a substring the error
// message must contain so the failure mode is unambiguous].
const NEGATIVE_CASES = [
  ['slug-traversal',  'escape.md',      'slug'],
  ['slug-quote',      'quoted.md',      'slug'],
  ['duplicate-route', 'second.md',      'Duplicate route'],
  ['bad-date',        'broken-date.md', 'date'],
  ['non-array-tags',  'string-tags.md', 'non-array tags'],
  ['duplicate-about', 'about-two.md',   'about'],
  ['bad-publish',     'typo.md',        'publish'],
];

for (const [dir, offendingNote, errorSubstring] of NEGATIVE_CASES) {
  test(`build fails for negative fixture: ${dir}`, () => {
    const res = runBuild({ vaultDir: fixturePath(dir) });

    assert.notEqual(res.status, 0,
      `expected a non-zero exit for ${dir}, got ${res.status}`);

    const combined = `${res.stdout}\n${res.stderr}`;
    assert.match(combined, /Error/,
      `expected an Error message for ${dir}`);
    assert.ok(combined.includes(offendingNote),
      `error for ${dir} must name the offending note "${offendingNote}".\n` +
      `Got:\n${combined}`);
    assert.ok(combined.includes(errorSubstring),
      `error for ${dir} must mention "${errorSubstring}".\nGot:\n${combined}`);
  });
}

test('duplicate-route names BOTH colliding notes', () => {
  const res = runBuild({ vaultDir: fixturePath('duplicate-route') });
  const combined = `${res.stdout}\n${res.stderr}`;
  assert.ok(combined.includes('first.md') && combined.includes('second.md'),
    `duplicate-route error must name both notes.\nGot:\n${combined}`);
});

test('duplicate-about names BOTH offending notes', () => {
  const res = runBuild({ vaultDir: fixturePath('duplicate-about') });
  const combined = `${res.stdout}\n${res.stderr}`;
  assert.ok(combined.includes('about-one.md') && combined.includes('about-two.md'),
    `duplicate-about error must name both notes.\nGot:\n${combined}`);
});

test('the canonical fixture-vault still builds cleanly (exit 0)', () => {
  // buildFixtureVault throws on any non-zero exit.
  const res = buildFixtureVault();
  assert.equal(res.status, 0);
  assert.match(res.stdout, /built in/);
});
