import { PageShell, IdentityRail, ElsewhereLinks, ArticleRow, ThoughtRow } from '@mattdoes/ds';

const links = [
  { label: 'github', href: 'https://github.com/mattdoesgh', meta: '/mattdoesgh' },
  { label: '𝕏', href: 'https://x.com/mattdoes', meta: '/mattdoes' },
  { label: 'rss', href: '/feed.xml', meta: '.xml' },
];

// The full page chrome — topbar (with live now-playing pill), the in-body
// shell, footer, and tweaks dialog — wrapping a representative homepage `<main>`
// (identity rail + a short timeline). Mirrors IndexPage: with `manualStatus`
// empty, the live now-playing pill is shown.
export const Home = () => (
  <PageShell active="home" nowPlaying="now: Boards of Canada — Roygbiv" footerText="© 2026 · mattdoes.online">
    <main className="page" id="main">
      <h1 className="visually-hidden">latest</h1>
      <IdentityRail
        who="matt · @mattdoes"
        bio="Developer, musician, tinkerer."
        stats={[
          { n: 42, label: 'journal' },
          { n: 128, label: 'thoughts' },
          { n: '8,432', label: 'scrobbles', id: 'scrobble-count' },
        ]}
      >
        <ElsewhereLinks links={links} />
      </IdentityRail>
      <section className="timeline">
        <ArticleRow
          url="/making/react-design-system/"
          title="Turning the site into a component library"
          date="2026-06-15T14:20:00.000Z"
          summary="Why the static templates are becoming real React components."
          tags={['react', 'meta']}
          kind="making"
          showKind
        />
        <ThoughtRow date="2026-06-14T16:05:00.000Z" id="t-20260614-1105" tags={['craft']}>
          <p>The best abstraction is the one you can delete in an afternoon.</p>
        </ThoughtRow>
      </section>
    </main>
  </PageShell>
);
