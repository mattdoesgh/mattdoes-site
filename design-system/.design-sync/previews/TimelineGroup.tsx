import { TimelineGroup, ArticleRow, ThoughtRow } from '@mattdoes/ds';

// Date/count divider plus the rows that follow it. Composed with the real
// row components inside `.timeline`, as the feed pages assemble it.

export const DayGroup = () => (
  <section className="timeline">
    <TimelineGroup label="jun 12 · 2026" count={2}>
      <ArticleRow
        url="/journal/on-typography/"
        title="On choosing a single typeface"
        date="2026-06-12T09:00:00.000Z"
        summary="One mono family, four weights, and what that buys."
        tags={['design', 'typography']}
        kind="journal"
        showKind
      />
      <ThoughtRow date="2026-06-12T16:05:00.000Z" id="t-20260612-1605" tags={['craft']}>
        <p>The best abstraction is the one you can delete in an afternoon.</p>
      </ThoughtRow>
    </TimelineGroup>
  </section>
);

export const Today = () => (
  <section className="timeline">
    <TimelineGroup label="today · jun 30" count={1}>
      <ArticleRow
        url="/making/edge-workers/"
        title="Two tiny workers, one origin"
        date="2026-06-30T11:30:00.000Z"
        summary="Keeping the CSP at connect-src self while staying live."
        tags={['cloudflare', 'architecture']}
        kind="making"
        showKind
      />
    </TimelineGroup>
  </section>
);
