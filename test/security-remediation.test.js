// Regression coverage for security remediations that cross the build
// boundary: authored raw HTML sanitization and attachment symlink rejection.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, runBuild, readDist } from './helpers/run-build.js';

function writeVault(files) {
  const vault = makeTempDir('mattdoes-sec-vault-');
  for (const [rel, body] of Object.entries(files)) {
    const dest = path.join(vault, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, body);
  }
  return vault;
}

test('authored raw HTML is sanitized before it reaches pages or feeds', () => {
  const vault = writeVault({
    'notes/raw-html.md': `---
publish: journal
title: Raw HTML
slug: raw-html
date: 2026-01-01
---

<script>alert(1)</script>
<style>body{display:none}</style>
<a href="javascript:alert(1)" onclick="alert(2)">bad link</a>
<img src="data:text/html,<script>x</script>" onerror="alert(3)" style="color:red">
<div style="background:url(https://evil.example/x)">styled</div>
<a href="https://example.com/good" onclick="alert(4)">good link</a>
`,
  });

  const res = runBuild({ vaultDir: vault });
  assert.equal(res.status, 0, `build failed:\n${res.stderr}`);

  const html = readDist(res.distDir, 'journal/raw-html/index.html');
  const feed = readDist(res.distDir, 'feed.xml');
  for (const output of [html, feed]) {
    assert.ok(!/<script\b[^>]*>\s*(?:alert|x)/i.test(output),
      'authored script tags must be stripped');
    assert.ok(!/<style\b/i.test(output), 'style tags must be stripped');
    assert.ok(!/\son[a-z]+\s*=/i.test(output), 'event attributes must be stripped');
    assert.ok(!/javascript:/i.test(output), 'javascript URLs must be stripped');
    assert.ok(!/data:text\/html/i.test(output), 'data HTML URLs must be stripped');
    assert.ok(!/\sstyle\s*=/i.test(output), 'inline style attributes must be stripped');
  }
  assert.ok(html.includes('href="https://example.com/good"'),
    'safe raw HTML links may survive sanitization');
});

test('symlinked attachments are rejected instead of copied into dist', () => {
  const vault = writeVault({
    'notes/post.md': `---
publish: journal
title: Symlink Check
slug: symlink-check
date: 2026-01-01
---

hello
`,
  });
  const attachDir = path.join(vault, 'attachments');
  fs.mkdirSync(attachDir, { recursive: true });
  fs.symlinkSync('/etc/passwd', path.join(attachDir, 'leak.txt'));

  const res = runBuild({ vaultDir: vault });
  assert.notEqual(res.status, 0, 'build must fail when an attachment is a symlink');
  assert.match(`${res.stdout}\n${res.stderr}`, /Refusing to copy symlinked asset/);
});
