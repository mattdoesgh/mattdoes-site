import test from 'node:test';
import assert from 'node:assert/strict';
import { intake } from '../lib/intake.js';
import { projectNotebookDays } from '../lib/notebook.js';

function daily(rel, date, body, tags = []) {
  return {
    rel,
    mtime: new Date(`${date}T18:00:00Z`),
    content: [
      '---',
      'publish: thoughts',
      `date: ${date}`,
      ...(tags.length ? ['tags:', ...tags.map(tag => `  - ${tag}`)] : []),
      '---',
      body,
    ].join('\n'),
  };
}

test('Thoughts retain their source daily-note provenance', () => {
  const model = intake([
    daily('daily/2026-04-19.md', '2026-04-19', [
      '## 08:15',
      'first thought',
      '',
      '## 20:45',
      '> quoted thought',
    ].join('\n'), ['notebook']),
  ]);

  assert.deepEqual(
    model.thoughts.map(({ id, sourceRel, sourceDate, body, quote, tags }) => ({
      id, sourceRel, sourceDate, body, quote, tags,
    })),
    [
      {
        id: 't-20260419-2045',
        sourceRel: 'daily/2026-04-19.md',
        sourceDate: '2026-04-19',
        body: 'quoted thought',
        quote: true,
        tags: ['notebook'],
      },
      {
        id: 't-20260419-0815',
        sourceRel: 'daily/2026-04-19.md',
        sourceDate: '2026-04-19',
        body: 'first thought',
        quote: false,
        tags: ['notebook'],
      },
    ],
  );
});

test('notebook projection groups by source day and preserves Intake order', () => {
  const thoughts = intake([
    daily('daily/2026-04-19.md', '2026-04-19', '## 08:15\nolder'),
    daily('daily/2026-04-20.md', '2026-04-20', '## 09:30\nnewer one\n\n## 12:00\nnewer two'),
  ]).thoughts;

  const days = projectNotebookDays(thoughts);

  assert.deepEqual(days.map(day => day.date), ['2026-04-20', '2026-04-19']);
  assert.deepEqual(
    days.map(day => day.thoughts.map(thought => thought.id)),
    [
      ['t-20260420-1200', 't-20260420-0930'],
      ['t-20260419-0815'],
    ],
  );
  assert.equal(days[0].thoughts[0], thoughts[0], 'projection should not clone Thoughts');
});
