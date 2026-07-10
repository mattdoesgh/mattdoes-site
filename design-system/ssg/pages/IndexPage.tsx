// Homepage — a quiet editorial front door. Selection belongs to
// lib/editorial-home.js; this page only presents one lead and a short list.
import {
  PageShell,
  ArticleRow,
  Time,
  safeUrl,
  type ArticleRowProps,
} from '../../src/index';

export interface IndexSite {
  config?: { title?: string; footerText?: string; status?: string };
  bio?: string;
  identity?: { name?: string; handle?: string };
  nowPlaying?: string;
}

export interface HomeArticle extends ArticleRowProps {
  kind: string;
}

export interface EditorialHome {
  featured: HomeArticle | null;
  recentWriting: HomeArticle[];
}

export interface IndexPageProps {
  site: IndexSite;
  editorial: EditorialHome;
}

function wordmark(site: IndexSite) {
  const identity = site.identity || {};
  const brand = (site.config?.title || '').split('.')[0] || identity.name || '';
  const nameLen = identity.name && brand.toLowerCase().startsWith(identity.name.toLowerCase())
    ? identity.name.length
    : brand.length;
  return { name: brand.slice(0, nameLen), dim: brand.slice(nameLen) };
}

export function IndexPage({ site, editorial }: IndexPageProps) {
  const { name, dim } = wordmark(site);
  const featured = editorial.featured;

  return (
    <PageShell
      active="home"
      siteTitle={site.config?.title}
      manualStatus={site.config?.status}
      nowPlaying={site.nowPlaying || ''}
      footerText={site.config?.footerText ?? ''}
    >
      <main className="page page--home" id="main">
        <section className="home-content" aria-labelledby="home-title">
          <header className="home-intro">
            <h1 id="home-title">
              {name}
              {dim ? <span className="dim">{dim}</span> : null}
              <span className="home-intro__dot" aria-hidden="true">.</span>
            </h1>
            {site.bio ? <p>{site.bio}</p> : null}
          </header>

          {featured ? (
            <article className={`home-lead home-lead--${featured.kind}`}>
              <div className="home-lead__meta">
                <span className="kind">{featured.kind}</span>
                <Time date={featured.date} format="day" />
              </div>
              <h2><a href={safeUrl(featured.url)}>{featured.title}</a></h2>
              {featured.summary ? <p>{featured.summary}</p> : null}
            </article>
          ) : (
            <p className="muted">Nothing published yet.</p>
          )}

          {editorial.recentWriting.length ? (
            <section className="home-recent" aria-label="recent writing">
              {editorial.recentWriting.map(entry => (
                <ArticleRow key={entry.url} {...entry} showKind />
              ))}
            </section>
          ) : null}

          <a className="home-archive-link" href="/blog/">all writing →</a>
        </section>
      </main>
    </PageShell>
  );
}
