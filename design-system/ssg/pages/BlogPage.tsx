// Blog page composition — the React mirror of templates/blog.js. Composes the
// PageShell chrome with the page-specific main content (identity rail, filter
// bar, the Row timeline, related rail).
import {
  PageShell,
  IdentityRail,
  ElsewhereLinks,
  ArticleRow,
  ThoughtRow,
  EmptyState,
  TagCloud,
  type ArticleRowProps,
  type ThoughtRowProps,
  type ExternalLink,
} from '../../src/index';

type ArticleEntry = ArticleRowProps & { kind: string };
type ThoughtEntry = ThoughtRowProps & { kind: 'thought' };
export type BlogEntry = ArticleEntry | ThoughtEntry;

export type SiteLink = ExternalLink;

export interface BlogPageProps {
  siteConfig: {
    title?: string;
    links?: SiteLink[];
    footerText?: string;
    /** Manual topbar status override (siteConfig.status). */
    status?: string;
  };
  entries: BlogEntry[];
  nowPlaying?: string;
}

function FilterBar({ kinds, topTags, count }: { kinds: string[]; topTags: string[]; count: number }) {
  return (
    <div className="filter">
      <span className="label">filter</span>
      <a href="/blog/" className="on all" data-filter="" data-kind-filter="" aria-current="true">
        all
      </a>
      {kinds.map((k) => (
        <a key={k} href={`/blog/?kind=${encodeURIComponent(k)}`} data-kind-filter={k}>
          {k}
        </a>
      ))}
      {topTags.slice(0, 8).map((t) => (
        <a key={t} href={`/blog/?tag=${encodeURIComponent(t)}`} data-filter={t}>
          {t}
        </a>
      ))}
      <span className="cnt">{count} entries</span>
    </div>
  );
}

export function BlogPage({ siteConfig, entries, nowPlaying = '' }: BlogPageProps) {
  const kindCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const e of entries) {
    kindCounts.set(e.kind, (kindCounts.get(e.kind) || 0) + 1);
    for (const t of e.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const kinds = [...kindCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <PageShell
      active="blog"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page" id="main">
        <h1 className="visually-hidden">blog</h1>

        <IdentityRail
          who="blog"
          bio="posts, micro-thoughts, and building-in-public on one reverse-chronological timeline."
          stats={[
            { n: entries.length, label: 'entries' },
            { n: tagCounts.size, label: 'tags' },
          ]}
        >
          <ElsewhereLinks links={siteConfig.links || []} />
        </IdentityRail>

        <section className="timeline">
          <FilterBar kinds={kinds} topTags={topTags.map(([t]) => t)} count={entries.length} />
          {entries.length ? (
            entries.map((e, i) =>
              e.kind === 'thought' ? (
                <ThoughtRow key={i} {...(e as ThoughtEntry)} />
              ) : (
                <ArticleRow key={i} {...(e as ArticleEntry)} showKind />
              ),
            )
          ) : (
            <EmptyState kind="blog" />
          )}
        </section>

        <aside className="side-right" aria-label="related">
          <TagCloud tags={topTags} baseHref="/blog/" />

          <div className="group">
            <h2>subscribe</h2>
            <ul>
              <li>
                <a href="/feed.xml">rss</a>
                <span className="meta">.xml</span>
              </li>
            </ul>
          </div>
        </aside>
      </main>
    </PageShell>
  );
}
