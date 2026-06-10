// Audit backlog: "Build input validation — Invalid and duplicate
// slug/frontmatter negative fixtures". Covers audit finding #2.
//
// Each NEGATIVE fixture under test/fixtures/ is a tiny standalone vault that
// trips exactly one Intake guard. Validation now lives behind the Intake
// interface (lib/intake.js), so these tests call readVault + intake directly
// — no subprocess, no Shiki startup — and assert the thrown message names
// the offending note (so an author can find it).
//
// The CLI contract (non-zero exit + the error on stderr) is still the
// author-facing surface of `npm run build`, so ONE subprocess smoke test per
// outcome survives: a failing vault exits non-zero, and the canonical
// fixture-vault builds clean.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readVault, intake } from '../lib/intake.js';
import { runBuild, buildFixtureVault, REPO_ROOT } from './helpers/run-build.js';

const fixturePath = (name) => path.join(REPO_ROOT, 'test', 'fixtures', name);

/** Run intake over a fixture vault and return the thrown message. */
function intakeError(dir) {
  try {
    intake(readVault(fixturePath(dir)));
  } catch (err) {
    return String(err.message);
  }
  assert.fail(`expected intake to throw for fixture ${dir}`);
}

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
  test(`intake rejects negative fixture: ${dir}`, () => {
    const msg = intakeError(dir);
    assert.ok(msg.includes(offendingNote),
      `error for ${dir} must name the offending note "${offendingNote}".\n` +
      `Got: ${msg}`);
    assert.ok(msg.includes(errorSubstring),
      `error for ${dir} must mention "${errorSubstring}".\nGot: ${msg}`);
  });
}

test('duplicate-route names BOTH colliding notes', () => {
  const msg = intakeError('duplicate-route');
  assert.ok(msg.includes('first.md') && msg.includes('second.md'),
    `duplicate-route error must name both notes.\nGot: ${msg}`);
});

test('duplicate-about names BOTH offending notes', () => {
  const msg = intakeError('duplicate-about');
  assert.ok(msg.includes('about-one.md') && msg.includes('about-two.md'),
    `duplicate-about error must name both notes.\nGot: ${msg}`);
});

// Intake's stated invariant (CONTEXT.md): same records in, same model out —
// no clock, no fs, no env. Two runs over identical records must produce a
// deeply-equal Content model; a diff here means something non-deterministic
// (a Date.now(), an fs read, iteration-order dependence) leaked in.
test('intake is deterministic: same records in, same model out', () => {
  const records = readVault(path.join(REPO_ROOT, 'test', 'fixture-vault'));
  assert.deepStrictEqual(intake(records), intake(records));
});

// ── CLI smoke tests (the subprocess surface authors actually see) ────────

test('a failing vault makes the CLI exit non-zero and print the error', () => {
  const res = runBuild({ vaultDir: fixturePath('slug-traversal') });
  assert.notEqual(res.status, 0,
    `expected a non-zero exit, got ${res.status}`);
  const combined = `${res.stdout}\n${res.stderr}`;
  assert.match(combined, /Error/, 'expected an Error message');
  assert.ok(combined.includes('escape.md'),
    `CLI error must name the offending note.\nGot:\n${combined}`);
});

test('the canonical fixture-vault still builds cleanly (exit 0)', () => {
  // buildFixtureVault throws on any non-zero exit.
  const res = buildFixtureVault();
  assert.equal(res.status, 0);
  assert.match(res.stdout, /built in/);
});
