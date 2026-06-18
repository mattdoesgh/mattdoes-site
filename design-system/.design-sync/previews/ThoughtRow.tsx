import { ThoughtRow } from '@mattdoes/ds';

export const Plain = () => (
  <ThoughtRow date="2026-06-14T16:05:00.000Z" id="t-20260614-1105" tags={['craft']}>
    <p>The best abstraction is the one you can delete in an afternoon.</p>
  </ThoughtRow>
);

export const Quote = () => (
  <ThoughtRow date="2026-06-10T20:41:00.000Z" id="t-20260610-1541" quote>
    <p>“Simplicity is a great virtue but it requires hard work to achieve it.”</p>
  </ThoughtRow>
);

export const FromMarkdown = () => (
  <ThoughtRow
    date="2026-06-02T08:15:00.000Z"
    id="t-20260602-0315"
    tags={['music', 'making']}
    html="<p>Mixed a track on headphones for once. Everything was too bright on the monitors. Lesson re-learned.</p>"
  />
);
