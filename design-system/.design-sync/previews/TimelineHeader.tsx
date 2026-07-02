import { TimelineHeader, ActionLink } from '@mattdoes/ds';

// Editorial heading block shared by feed and article-like timeline pages
// (`.post-head.timeline-head`, carries the page's single h1). Wrapped in
// `.timeline` as it sits on the real pages.

export const Writing = () => (
  <section className="timeline">
    <TimelineHeader
      title="writing"
      lede="Essays, project notes, and short thoughts from the vault: recent work, small observations, and notes from whatever is currently being built."
    />
  </section>
);

export const WithKickerAndActions = () => (
  <section className="timeline">
    <TimelineHeader
      kicker="section"
      title="journal"
      lede="Reflective posts, usually weighing a tradeoff."
      actions={<ActionLink href="/feed.xml" tone="primary">subscribe via rss</ActionLink>}
    />
  </section>
);
