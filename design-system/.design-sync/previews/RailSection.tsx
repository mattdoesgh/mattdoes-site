import { RailSection } from '@mattdoes/ds';

// Quiet side-rail section (`.group` contract). Composed inside `.side-right`
// so the muted rail typography applies, as on the real pages.

export const StartHere = () => (
  <aside className="side-right" aria-label="start reading">
    <RailSection heading="start here">
      <ul>
        <li><a href="/journal/">journal</a><span className="meta">latest</span></li>
        <li><a href="/making/">making</a><span className="meta">latest</span></li>
        <li><a href="/thoughts/">thoughts archive</a><span className="meta">short posts</span></li>
        <li><a href="/feed.xml">rss</a><span className="meta">subscribe</span></li>
      </ul>
    </RailSection>
  </aside>
);

export const WithCountMeta = () => (
  <aside className="side-right" aria-label="tags">
    <RailSection heading="tags" meta="24">
      <ul>
        <li><a href="/?tag=design">design</a><span className="meta">8</span></li>
        <li><a href="/?tag=cloudflare">cloudflare</a><span className="meta">5</span></li>
        <li><a href="/?tag=typography">typography</a><span className="meta">3</span></li>
      </ul>
    </RailSection>
  </aside>
);
