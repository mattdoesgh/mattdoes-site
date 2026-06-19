import { TagCloud } from '@mattdoes/ds';

// The right-rail "by tag" group: each Tag chip with its occurrence count. Pairs
// are already ordered; baseHref scopes the chip links to the listing page
// (mirrors BlogPage's `<TagCloud tags={topTags} baseHref="/blog/" />`).
export const ByTag = () => (
  <TagCloud
    baseHref="/blog/"
    tags={[
      ['react', 8],
      ['typography', 6],
      ['cloudflare', 5],
      ['music', 4],
      ['performance', 3],
      ['meta', 2],
    ]}
  />
);

export const CustomHeading = () => (
  <TagCloud
    heading="topics"
    tags={[
      ['design', 5],
      ['craft', 3],
      ['web', 2],
    ]}
  />
);
