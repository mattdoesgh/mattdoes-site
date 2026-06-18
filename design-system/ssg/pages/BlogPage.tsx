// Blog page composition — the React mirror of templates/blog.js. Composes the
// Layout shell with the page-specific main content (identity rail, filter bar,
// the Row timeline, related rail). The page-only bits (filter bar, rails) are
// authored here for now; they graduate to DS components in the "Everything"
// pass.
import {
  Layout,
  ArticleRow,
  ThoughtRow,
  EmptyState,
  StatusPill,
  safeUrl,
  relValue,
  type ArticleRowProps,
  type ThoughtRowProps,
} from '../../src/index';

type ArticleEntry = ArticleRowProps & { kind: string };
type ThoughtEntry = ThoughtRowProps & { kind: 'thought' };
export type BlogEntry = ArticleEntry | ThoughtEntry;

export interface SiteLink {
  label: string;
  href: string;
  meta?: string;
}

export interface BlogPageProps {
  siteConfig: {
    title: string;
    links?: SiteLink[];
    footerText?: string;
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
  const links = (siteConfig.links || []).filter((l) => l.href);

  return (
    <Layout
      topbar={{
        siteTitle: siteConfig.title,
        active: 'blog',
        status: nowPlaying ? <StatusPill text={nowPlaying} dot live /> : undefined,
      }}
      footer={{ footerText: siteConfig.footerText ?? '' }}
    >
      <main className="page" id="main">
        <h1 className="visually-hidden">blog</h1>

        <aside className="side-left" aria-label="page meta">
          <div className="ident">
            <div className="who">blog</div>
            <div className="bio">posts, micro-thoughts, building-in-public — one timeline, reverse-chronological.</div>
            <div className="stats">
              <span className="s">
                <span className="n">{entries.length}</span>entries
              </span>
              <span className="s">
                <span className="n">{tagCounts.size}</span>tags
              </span>
            </div>
          </div>

          {links.length ? (
            <div className="group">
              <h2>elsewhere</h2>
              <ul>
                {links.map((l) => (
                  <li key={l.href}>
                    <a href={safeUrl(l.href)} rel={relValue(l.href)}>
                      {l.label}
                    </a>
                    {l.meta ? <span className="meta">{l.meta}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

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
          {topTags.length ? (
            <div className="group">
              <h2>by tag</h2>
              <ul>
                {topTags.map(([t, n]) => (
                  <li key={t}>
                    <a className="tg" href={`/blog/?tag=${encodeURIComponent(t)}`} data-tag={t}>
                      {t}
                    </a>
                    <span className="meta">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
    </Layout>
  );
}
