import { Layout, ArticleRow, ThoughtRow, StatusPill } from '@mattdoes/ds';

// The full in-body page shell with a representative blog timeline inside.
export const BlogTimeline = () => (
  <Layout
    topbar={{ active: 'blog', status: <StatusPill text="now: Boards of Canada — Roygbiv" dot live /> }}
    footer={{ footerText: '© 2026 · mattdoes.online' }}
  >
    <main className="page" id="main">
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
  </Layout>
);
