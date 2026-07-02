import { TimelineRow, Time, TagList } from '@mattdoes/ds';

// The shared row shell (`.row` data contract) that ArticleRow/ThoughtRow build
// on. Composed directly here to show the gutter (kind + time) and body slots,
// plus the featured variant. Wrapped in `.timeline` for the grid context.

export const FeedRow = () => (
  <section className="timeline">
    <TimelineRow
      kind="making"
      tags={['cloudflare', 'architecture']}
      gutter={
        <>
          <span className="kind">making</span>
          <span className="when"><Time date="2026-06-08T11:30:00.000Z" /></span>
        </>
      }
    >
      <div className="body">
        <a href="/making/edge-workers/"><strong>Two tiny workers, one origin</strong></a>
        {' — Keeping the CSP at connect-src self while staying live. '}
        <TagList tags={['cloudflare', 'architecture']} />
      </div>
    </TimelineRow>
  </section>
);

export const Featured = () => (
  <section className="timeline">
    <TimelineRow
      kind="journal"
      featured
      tags={['design', 'typography']}
      gutter={
        <>
          <span className="kind">journal</span>
          <span className="when"><Time date="2026-06-12T09:00:00.000Z" /></span>
        </>
      }
    >
      <div className="body">
        <a href="/journal/on-typography/"><strong>On choosing a single typeface</strong></a>
        {' — One mono family, four weights, and what that buys. '}
        <TagList tags={['design', 'typography']} />
      </div>
    </TimelineRow>
  </section>
);
