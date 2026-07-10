import test from 'node:test';
import assert from 'node:assert/strict';
import { projectEditorialHome } from '../lib/editorial-home.js';

test('editorial projection selects long-form writing, notebook days, and developed topics', () => {
  const articles = [
    { title: 'older', date: '2026-06-01' },
    { title: 'featured', date: '2026-07-01' },
    { title: 'middle', date: '2026-06-15' },
    { title: 'oldest', date: '2026-05-01' },
  ];
  const notebookDays = [
    { date: '2026-07-02', thoughts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] },
    { date: '2026-07-01', thoughts: [{ id: 'e' }] },
    { date: '2026-06-30', thoughts: [{ id: 'f' }] },
  ];
  const topics = [
    { name: 'site', count: 4 },
    { name: 'music', count: 2 },
    { name: 'single', count: 1 },
    { name: 'ai', count: 3 },
  ];

  const home = projectEditorialHome({ articles, notebookDays, topics });

  assert.equal(home.featured.title, 'featured');
  assert.deepEqual(home.recentWriting.map(entry => entry.title), ['middle', 'older']);
  assert.deepEqual(home.notebookDays.map(day => day.date), ['2026-07-02', '2026-07-01']);
  assert.deepEqual(home.notebookDays[0].thoughts.map(thought => thought.id), ['a', 'b', 'c']);
  assert.deepEqual(home.currentTopics.map(topic => topic.name), ['site', 'music', 'ai']);
  assert.equal(notebookDays[0].thoughts.length, 4, 'projection must not mutate source days');
});

test('editorial projection returns a stable empty shape', () => {
  assert.deepEqual(projectEditorialHome(), {
    featured: null,
    recentWriting: [],
    notebookDays: [],
    currentTopics: [],
  });
});
