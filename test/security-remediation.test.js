// Notes are not rendered. Symlinked attachments are still refused.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, runBuild, listDistHtml } from './helpers/run-build.js';

function writeVault(files) {
  const vault = makeTempDir('mattdoes-sec-vault-');
  for (const [rel, body] of Object.entries(files)) {
    const dest = path.join(vault, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, body);
  }
  return vault;
}

test('authored notes are not published into pages or feeds', () => {
  const vault = writeVault({
    'notes/raw-html.md': `---
publish: about
title: Raw HTML
---

<script>alert(1)</script>
<a href="javascript:alert(1)">bad link</a>
<a href="https://example.com/good">good link</a>
`,
  });
  const res = runBuild({ contentDir: vault });
  assert.equal(res.status, 0, `build failed:\n${res.stderr}`);
  assert.equal(fs.existsSync(path.join(res.distDir, 'feed.xml')), false);
  assert.equal(fs.existsSync(path.join(res.distDir, 'about', 'index.html')), false);
  for (const file of listDistHtml(res.distDir)) {
    const html = fs.readFileSync(file, 'utf8');
    assert.equal(/<script\b[^>]*>\s*alert/i.test(html), false, file);
    assert.equal(/href="javascript:/i.test(html), false, file);
  }
});

test('symlinked attachments are rejected instead of copied into dist', () => {
  const vault = writeVault({});
  const attachDir = path.join(vault, 'attachments');
  fs.mkdirSync(attachDir, { recursive: true });
  fs.symlinkSync('/etc/passwd', path.join(attachDir, 'leak.txt'));

  const res = runBuild({ contentDir: vault });
  assert.notEqual(res.status, 0, 'build must fail when an attachment is a symlink');
  assert.match(`${res.stdout}\n${res.stderr}`, /Refusing to copy symlinked asset/);
});

test('a symlinked note is not copied into dist', () => {
  const vault = makeTempDir('mattdoes-sec-vault-');
  const notesDir = path.join(vault, 'notes');
  fs.mkdirSync(notesDir, { recursive: true });
  fs.symlinkSync('/etc/passwd', path.join(notesDir, 'external.md'));

  const res = runBuild({ contentDir: vault });
  assert.equal(res.status, 0, res.stderr);
  const leaked = listDistHtml(res.distDir).some((file) => fs.readFileSync(file, 'utf8').includes('root:x:0:0'));
  assert.equal(leaked, false);
});
