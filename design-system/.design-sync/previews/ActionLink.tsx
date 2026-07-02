import { ActionLink } from '@mattdoes/ds';

// Editorial CTA link — a prominent text action without introducing buttons.
// Two tones (primary/secondary); shown solo and as the paired nav the Hero
// and TimelineHeader render.

export const Primary = () => (
  <ActionLink href="/blog/" tone="primary">read latest writing</ActionLink>
);

export const Secondary = () => (
  <ActionLink href="/feed.xml">subscribe via rss</ActionLink>
);

export const ActionPair = () => (
  <nav className="home-actions" aria-label="quick links">
    <ActionLink href="/blog/" tone="primary">read latest writing</ActionLink>
    <ActionLink href="/feed.xml">subscribe via rss</ActionLink>
  </nav>
);
