import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEditorialHome } from '../lib/editorial-home.js';

test('the homepage does not select long-form writing', () => {
  const articles = [
    { title: 'older', date: '2026-06-01' },
    { title: 'featured', date: '2026-07-01' },
    { title: 'middle', date: '2026-06-15' },
    { title: 'oldest', date: '2026-05-01' },
  ];

  assert.deepEqual(projectEditorialHome({ articles }), {
    featured: null,
    recentWriting: [],
  });
  assert.deepEqual(projectEditorialHome(), {
    featured: null,
    recentWriting: [],
  });
});
