// Ordered curriculum. A lesson ships by adding its page and setting status
// to open or done. next stays on the hub as quiet text, with no link.

/** @typedef {'done' | 'open' | 'next'} LessonStatus */

/**
 * @typedef {object} Lesson
 * @property {string} slug
 * @property {string} label
 * @property {LessonStatus} status
 */

/**
 * @typedef {object} Track
 * @property {string} id
 * @property {string} label
 * @property {Lesson[]} lessons
 */

/** @type {Track[]} */
export const learningTracks = [
  {
    id: 'data-structures',
    label: 'data structures',
    lessons: [
      { slug: 'arrays', label: 'arrays & big-o', status: 'open' },
      { slug: 'hash-maps', label: 'hash maps', status: 'next' },
      { slug: 'linked-lists', label: 'linked lists', status: 'next' },
      { slug: 'stacks', label: 'stacks', status: 'next' },
      { slug: 'queues', label: 'queues', status: 'next' },
      { slug: 'trees', label: 'trees & traversals', status: 'next' },
      { slug: 'heaps', label: 'heaps', status: 'next' },
      { slug: 'graphs', label: 'graphs & bfs/dfs', status: 'next' },
    ],
  },
  {
    id: 'operating-systems',
    label: 'operating systems',
    lessons: [
      { slug: 'processes', label: 'processes', status: 'next' },
      { slug: 'cpu-scheduling', label: 'cpu scheduling', status: 'next' },
      { slug: 'mlfq', label: 'multilevel feedback queue', status: 'next' },
      { slug: 'proportional-share', label: 'proportional share', status: 'next' },
      { slug: 'address-spaces', label: 'address spaces', status: 'next' },
      { slug: 'address-translation', label: 'address translation', status: 'next' },
      { slug: 'paging', label: 'paging & tlbs', status: 'next' },
      { slug: 'threads-locks-shell', label: 'threads, locks & shell', status: 'next' },
    ],
  },
  {
    id: 'ai-systems',
    label: 'ai systems',
    lessons: [
      { slug: 'dev-environment', label: 'dev environment', status: 'next' },
      { slug: 'python-foundations', label: 'python foundations', status: 'next' },
      { slug: 'the-loop', label: 'the loop', status: 'next' },
      { slug: 'plan-execute', label: 'plan & execute', status: 'next' },
      { slug: 'reflexion', label: 'reflexion', status: 'next' },
      { slug: 'self-refine', label: 'self-refine', status: 'next' },
      { slug: 'tool-use', label: 'tool use', status: 'next' },
      { slug: 'virtual-context', label: 'virtual context', status: 'next' },
      { slug: 'skill-libraries', label: 'skill libraries', status: 'next' },
      { slug: 'workflow-patterns', label: 'workflow patterns', status: 'next' },
      { slug: 'stateful-graphs', label: 'stateful graphs', status: 'next' },
      { slug: 'actor-systems', label: 'actor systems', status: 'next' },
    ],
  },
];

const STATUSES = new Set(['done', 'open', 'next']);

/**
 * @param {Track[]} [tracks]
 * @returns {Lesson[]}
 */
export function publishedLessons(tracks = learningTracks) {
  return tracks.flatMap((track) => track.lessons.filter((lesson) => (
    lesson.status === 'open' || lesson.status === 'done'
  )));
}

/**
 * @param {Track[]} [tracks]
 * @returns {string[]}
 */
export function publishedLearningPaths(tracks = learningTracks) {
  return ['/learning/', ...publishedLessons(tracks).map((lesson) => `/learning/${lesson.slug}/`)];
}

/**
 * @param {Track[]} [tracks]
 * @returns {void}
 */
export function assertCurriculum(tracks = learningTracks) {
  const slugs = new Set();
  for (const track of tracks) {
    if (!track.label || track.label !== track.label.toLowerCase()) {
      throw new Error(`learning track label must be lowercase "${track.label}"`);
    }
    for (const lesson of track.lessons) {
      if (!STATUSES.has(lesson.status)) {
        throw new Error(`learning lesson "${lesson.slug}" has status "${lesson.status}"`);
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lesson.slug)) {
        throw new Error(`learning lesson slug "${lesson.slug}" is invalid`);
      }
      if (slugs.has(lesson.slug)) {
        throw new Error(`learning lesson slug "${lesson.slug}" is duplicated`);
      }
      slugs.add(lesson.slug);
      if (!lesson.label || lesson.label !== lesson.label.toLowerCase()) {
        throw new Error(`learning lesson label must be lowercase "${lesson.label}"`);
      }
    }
  }
}
