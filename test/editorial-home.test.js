import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEditorialHome } from '../lib/editorial-home.js';

test('editorial projection selects one current lead and a short writing list', () => {
  const articles = [
    { title: 'older', date: '2026-06-01' },
    { title: 'featured', date: '2026-07-01' },
    { title: 'middle', date: '2026-06-15' },
    { title: 'oldest', date: '2026-05-01' },
  ];
  const home = projectEditorialHome({ articles });

  assert.equal(home.featured.title, 'featured');
  assert.deepEqual(home.recentWriting.map(entry => entry.title), ['middle', 'older', 'oldest']);
});

test('editorial projection returns a stable empty shape', () => {
  assert.deepEqual(projectEditorialHome(), {
    featured: null,
    recentWriting: [],
  });
});
