import { IdentityRail, ElsewhereLinks } from '@mattdoes/ds';

const links = [
  { label: 'github', href: 'https://github.com/mattdoesgh', meta: '/mattdoesgh' },
  { label: '𝕏', href: 'https://x.com/mattdoes', meta: '/mattdoes' },
  { label: 'Spotify', href: 'https://open.spotify.com/artist/617fKVTXkDafXJshlNUzF3', meta: '↗' },
  { label: 'rss', href: '/feed.xml', meta: '.xml' },
];

// The homepage left rail: who/bio/stats identity card with an elsewhere group
// nested below (mirrors IndexPage). `scrobble-count` carries the id the live
// updater targets.
export const HomeRail = () => (
  <IdentityRail
    who="matt · @mattdoes"
    bio="Developer, musician, tinkerer."
    stats={[
      { n: 42, label: 'journal' },
      { n: 128, label: 'thoughts' },
      { n: 17, label: 'making' },
      { n: '8,432', label: 'scrobbles', id: 'scrobble-count' },
    ]}
  >
    <ElsewhereLinks links={links} />
  </IdentityRail>
);

// A section landing rail: just the who/bio block, no stats (mirrors BlogPage).
export const SectionRail = () => (
  <IdentityRail
    who="blog"
    bio="posts, micro-thoughts, and building-in-public on one reverse-chronological timeline."
  />
);
