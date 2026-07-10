import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('article and thought renderers expose visual hooks without changing the Row data seam', () => {
  const article = read('design-system/src/components/ArticleRow.tsx');
  const thought = read('design-system/src/components/ThoughtRow.tsx');
  const shell = read('design-system/src/components/TimelineRow.tsx');

  assert.match(article, /className="article-row"/);
  assert.match(article, /className="article-row__title"/);
  assert.match(article, /className="article-row__summary"/);
  assert.match(thought, /className="thought-row"/);

  assert.match(shell, /data-kind=/);
  assert.match(shell, /data-tags=/);
  assert.match(shell, /data-featured=/);
});

test('each writing kind has a distinct stylesheet treatment', () => {
  const css = read('static/_shared.css');

  assert.match(css, /\.row--journal\s*\{/);
  assert.match(css, /\.row--making\s*\{/);
  assert.match(css, /\.row--thought\s*\{/);
  assert.match(css, /\.row--thought \.body\s*\{/);
});

test('thought hover surface overrides the generic row accent edge', () => {
  const css = read('static/_shared.css');

  // The generic `.row::before` hover overlay is declared later in the file.
  // Keep the thought override more specific so its inner notebook rule does
  // not appear beside a second accent edge on hover.
  assert.match(css, /\.row\.row--thought::before\s*\{[\s\S]*?box-shadow:\s*none;/);
});
