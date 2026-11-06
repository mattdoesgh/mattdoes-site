// The learning hub. One track, then its lessons, in curriculum order.
// open and done rows link. next rows are text.

import { esc } from '../lib/safe-url.js';
import { learningTracks } from './curriculum.js';
import { renderLearningDocument } from './shell.js';

/**
 * @param {{ slug: string, label: string, status: string }} lesson
 * @returns {string}
 */
function lessonRow(lesson) {
  const label = esc(lesson.label);
  if (lesson.status === 'next') {
    return `<li class="lesson-row"><span class="lesson-next">${label}</span></li>`;
  }
  const href = esc(`/learning/${lesson.slug}/`);
  return `<li class="lesson-row"><a class="lesson" href="${href}">${label}</a></li>`;
}

/**
 * @param {string} [siteUrl]
 * @returns {string}
 */
export function renderLearningHub(siteUrl) {
  const tracks = learningTracks.map((track) => {
    const rows = track.lessons.map(lessonRow).join('\n            ');
    return `<section class="track">
          <h2>${esc(track.label)}</h2>
          <ul class="lessons">
            ${rows}
          </ul>
        </section>`;
  }).join('\n        ');
  return renderLearningDocument({
    siteUrl,
    path: '/learning/',
    cssHref: './learning.css',
    title: 'matt does learning',
    description: 'matt does learning.',
    main: `<h1 class="sign"><a href="/">matt does learning</a></h1>
      <p class="deck">a link is ready. a quiet row is next.</p>
      <nav aria-label="learning">
        ${tracks}
      </nav>`,
  });
}
