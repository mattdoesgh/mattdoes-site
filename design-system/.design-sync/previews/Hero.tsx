import { Hero, ActionLink } from '@mattdoes/ds';

// The homepage intro band (mirrors IndexPage): split wordmark with the
// accent dot, handle kicker, bio tagline, stat strip, action-link nav.
// `scrobble-count` carries the id the live updater targets on the homepage.
export const HomepageHero = () => (
  <Hero
    name="matt"
    dim="does"
    kicker="@mattdoes"
    tagline="Developer, musician, tinkerer."
    stats={[
      { n: 42, label: 'journal' },
      { n: 128, label: 'thoughts' },
      { n: 17, label: 'making' },
      { n: '8,432', label: 'scrobbles', id: 'scrobble-count' },
    ]}
    actions={
      <>
        <ActionLink href="/blog/" tone="primary">read latest writing</ActionLink>
        <ActionLink href="/feed.xml">subscribe via rss</ActionLink>
      </>
    }
  />
);

// Minimal form: just the wordmark and tagline.
export const WordmarkHero = () => (
  <Hero name="matt" dim="does" tagline="Developer, musician, tinkerer." />
);
