// The build workflow should not receive a write token, and actions should
// not float on moving tags.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PINS = {
  'actions/checkout': ['3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
  'actions/setup-node': ['249970729cb0ef3589644e2896645e5dc5ba9c38', 'v6.5.0'],
  'actions/upload-artifact': ['cf430e030ddbb5b0abf93d22962f4752f3646cd9', 'v7.0.2'],
};

test('build workflow is contents-read and pins every action to a commit', () => {
  const yml = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'build.yml'), 'utf8');
  assert.match(yml, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(yml, /uses:\s+\S+@v\d/);

  const uses = [...yml.matchAll(/uses:\s+(\S+)/g)].map(m => m[1]);
  assert.equal(uses.length, 7);
  for (const use of uses) {
    const match = use.match(/^([^@]+)@([0-9a-f]{40})$/);
    assert.ok(match, `action must be a full commit SHA: ${use}`);
    const pin = PINS[match[1]];
    assert.ok(pin, `unexpected action ${match[1]}`);
    assert.equal(match[2], pin[0]);
    assert.match(yml, new RegExp(`${match[1]}@${match[2]} # ${pin[1].replace(/\./g, '\\.')}`));
  }
});
