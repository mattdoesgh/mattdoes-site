import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicIndex, topicPath, topicSlug } from '../lib/topic-index.js';

const articles = [
  {
    kind: 'journal', title: 'Designing slower software', url: '/journal/slower/',
    summary: 'Why deliberate tools create room to think.',
    date: '2026-07-08T12:00:00Z', tags: ['design', 'tools'],
  },
  {
    kind: 'making', title: 'Workbench notes', url: '/making/workbench/',
    body: 'A small interface for a larger system.',
    date: '2026-07-06T12:00:00Z', tags: ['tools', 'code'],
  },
];

const thoughts = [
  {
    id: 't-20260709-0900', body: '**Tools** should leave room for judgment.',
    date: '2026-07-09T14:00:00Z', tags: ['tools', 'design'],
  },
  {
    id: 't-20260705-1000', body: 'Code is a material, not just an output.',
    date: '2026-07-05T15:00:00Z', tags: ['code'],
  },
];

test('buildTopicIndex derives cross-kind counts, recency, paths, and representative items', () => {
  const index = buildTopicIndex(articles, thoughts, { representativeLimit: 2 });

  assert.deepEqual(index.topics.map(topic => topic.name), ['tools', 'design', 'code']);
  const tools = index.get(' TOOLS ');
  assert.equal(tools.path, '/topics/tools/');
  assert.equal(tools.count, 3);
  assert.deepEqual(tools.counts, { thought: 1, journal: 1, making: 1 });
  assert.equal(tools.latestAt, '2026-07-09T14:00:00.000Z');
  assert.deepEqual(tools.items.map(item => item.kind), ['thought', 'journal']);
  assert.equal(tools.items[0].url, '/thoughts/#t-20260709-0900');
  assert.equal(tools.items[0].excerpt, 'Tools should leave room for judgment.');
});

test('topic paths are readable for safe tags and collision-resistant for punctuation', () => {
  assert.equal(topicSlug('web-performance'), 'web-performance');
  assert.equal(topicPath('web-performance'), '/topics/web-performance/');
  assert.match(topicSlug('C++'), /^c-[a-z0-9]{7}$/);
  assert.notEqual(topicSlug('C++'), topicSlug('C#'));
  assert.equal(topicPath('   '), null);
});

test('relatedTo crosses kinds, ranks by shared topics, excludes self, and honors limit', () => {
  const index = buildTopicIndex(articles, thoughts);
  const related = index.relatedTo(articles[0], { limit: 2 });

  assert.deepEqual(related.map(item => item.url), [
    '/thoughts/#t-20260709-0900',
    '/making/workbench/',
  ]);
  assert.deepEqual(related[0].sharedTopics, ['tools', 'design']);
  assert.deepEqual(related[1].sharedTopics, ['tools']);
  assert.ok(!related.some(item => item.url === articles[0].url));
  assert.deepEqual(index.relatedTo(articles[0], { limit: 0 }), []);
  assert.deepEqual(index.relatedTo({ ...articles[0], tags: [] }), []);
});

test('buildTopicIndex does not mutate source entries or their tags', () => {
  const source = [{
    kind: 'journal', title: 'A', url: '/a/', summary: '<em>Hello</em>',
    date: '2026-07-01T00:00:00Z', tags: ['Mixed Case'],
  }];
  const before = structuredClone(source);

  const index = buildTopicIndex(source, []);

  assert.deepEqual(source, before);
  assert.equal(index.get('mixed case').items[0].excerpt, 'Hello');
});
