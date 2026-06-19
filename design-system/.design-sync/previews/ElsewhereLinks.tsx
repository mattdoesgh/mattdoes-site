import { ElsewhereLinks } from '@mattdoes/ds';

// The site's real "elsewhere" rail links (site.config.js). Off-site hrefs are
// sanitized and get rel by the component; entries without an href are dropped.
const links = [
  { label: 'github', href: 'https://github.com/mattdoesgh', meta: '/mattdoesgh' },
  { label: '𝕏', href: 'https://x.com/mattdoes', meta: '/mattdoes' },
  { label: 'Spotify', href: 'https://open.spotify.com/artist/617fKVTXkDafXJshlNUzF3', meta: '↗' },
  { label: 'rss', href: '/feed.xml', meta: '.xml' },
  { label: 'say hi', href: 'mailto:matt@mattdoes.online', meta: '↗' },
];

export const Elsewhere = () => <ElsewhereLinks links={links} />;

export const CustomHeading = () => <ElsewhereLinks heading="find me" links={links.slice(0, 3)} />;
