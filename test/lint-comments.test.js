// The comment check fails closed on the pattern list and stays quiet on
// the current tree.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOW, PATTERNS, lintRepo, lintText } from '../scripts/lint-comments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the tree has no conversation comments', () => {
  const hits = lintRepo(ROOT);
  assert.deepEqual(hits, [], hits.map((hit) => `${hit.file}:${hit.line} ${hit.id}: ${hit.text}`).join('\n'));
});

test('each pattern matches its own sample inside a comment', () => {
  for (const pattern of PATTERNS) {
    assert.equal(pattern.re.test(pattern.sample), true, pattern.id);
    const hits = lintText(`// ${pattern.sample}\n`, 'sample.js');
    assert.equal(hits.length, 1, pattern.id);
    assert.equal(hits[0].id, pattern.id, pattern.id);
  }
});

test('a marker on the line is the escape, and strings are not comments', () => {
  assert.equal(lintText(`// previously cached ${ALLOW}\n`, 'sample.js').length, 0);
  assert.equal(lintText('const s = "no longer";\n', 'sample.js').length, 0);
  assert.equal(lintText('const s = `// previously cached`;\n', 'sample.js').length, 0);
  assert.equal(lintText('const re = /\\bno longer\\b/;\n', 'sample.js').length, 0);
  assert.equal(lintText('// Send a User-agent so the API can tell clients apart.\n', 'sample.js').length, 0);
  assert.equal(lintText('throw new Error(`intel: ${file} no longer contains it`);\n', 'sample.js').length, 0);

  const block = '/*\n * previously cached\n * kept ' + ALLOW + '\n */\n';
  const hits = lintText(block, 'sample.js');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);

  assert.equal(lintText('/* previously cached */\n', 'sample.css').length, 1);
  assert.equal(lintText('# we now deploy\nname: build\n', 'build.yml').length, 1);
  assert.equal(lintText('<!-- as discussed -->\n<p>ok</p>\n', 'page.html').length, 1);
  const inline = lintText('<script>\n// previously cached\n</script>\n', 'page.html');
  assert.equal(inline.length, 1);
  assert.equal(inline[0].line, 2);
  const nested = lintText('const n = `x ${\n// previously cached\n1}`;\n', 'sample.js');
  assert.equal(nested.length, 1);
  assert.equal(nested[0].line, 2);
  assert.equal(lintText('limit = 100 # requests per IP\n', 'wrangler.toml').length, 0);
});

test('the check is an npm script and a CI step', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['check:comments'], 'node scripts/lint-comments.js');
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build.yml'), 'utf8');
  assert.match(yml, /npm run check:comments/);
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  assert.match(agents, /check:comments/);
});
