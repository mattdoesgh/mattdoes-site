// Homepage — an editorial front door over the Content model. Selection and
// grouping belong to lib/editorial-home.js; this page renders that projection.
import {
  PageShell,
  Hero,
  ElsewhereLinks,
  ActionLink,
  RailSection,
  ArticleRow,
  NotebookDay,
  Time,
  TagList,
  safeUrl,
  type ArticleRowProps,
  type NotebookDayProps,
} from '../../src/index';

export interface IndexSite {
  config?: { title?: string; footerText?: string; status?: string };
  bio?: string;
  identity?: { name?: string; handle?: string };
  links?: { label: string; href: string; meta?: string }[];
  nowPlaying?: string;
}

export interface HomeArticle extends ArticleRowProps {
  kind: string;
}

export interface HomeTopic {
  name: string;
  path: string;
  count: number;
  items: { kind: string; title?: string; excerpt: string }[];
}

export interface EditorialHome {
  featured: HomeArticle | null;
  recentWriting: HomeArticle[];
  notebookDays: NotebookDayProps[];
  currentTopics: HomeTopic[];
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
      <main className="page page--editorial" id="main">
        <Hero
          name={name || undefined}
          dim={dim || undefined}
          tagline={site.bio}
          actions={
            <>
              <ActionLink href={featured?.url || '/blog/'} tone="primary">start with the latest</ActionLink>
              <ActionLink href="/blog/">browse all writing</ActionLink>
            </>
          }
        />

        <section className="home-main" aria-labelledby="home-writing-title">
          <header className="post-head home-main__head">
            <div className="kicker"><span className="kind">front page</span></div>
            <h1 id="home-writing-title">writing worth starting with</h1>
            <p className="lede">Longer arguments, work in progress, and notebook fragments—organized for reading rather than recency alone.</p>
          </header>

          {featured ? (
            <article className={`feature-story feature-story--${featured.kind}`}>
              <div className="feature-story__meta">
                <span className="kind">featured {featured.kind}</span>
                <Time date={featured.date} format="day" />
                {featured.readTime ? <span>{featured.readTime}</span> : null}
              </div>
              <h2><a href={safeUrl(featured.url)}>{featured.title}</a></h2>
              {featured.summary ? <p>{featured.summary}</p> : null}
              <div className="feature-story__foot">
                <TagList tags={featured.tags} tagPaths={featured.tagPaths} />
                <a className="feature-story__read" href={safeUrl(featured.url)}>read the piece →</a>
              </div>
            </article>
          ) : (
            <p className="muted">Nothing published yet.</p>
          )}

          {editorial.recentWriting.length ? (
            <section className="home-section" aria-labelledby="recent-writing-title">
              <div className="home-section__head">
                <h2 id="recent-writing-title">more writing</h2>
                <a href="/blog/">full archive →</a>
              </div>
              {editorial.recentWriting.map(entry => (
                <ArticleRow key={entry.url} {...entry} showKind />
              ))}
            </section>
          ) : null}

          {editorial.notebookDays.length ? (
            <section className="home-section home-notebook" aria-labelledby="recent-notebook-title">
              <div className="home-section__head">
                <h2 id="recent-notebook-title">from the notebook</h2>
                <a href="/thoughts/">open the notebook →</a>
              </div>
              {editorial.notebookDays.map(day => <NotebookDay key={day.date} {...day} />)}
            </section>
          ) : null}
        </section>

        <aside className="side-left" aria-label="current idea paths">
          <RailSection heading="currently exploring">
            {editorial.currentTopics.length ? (
              <ul>
                {editorial.currentTopics.map(topic => (
                  <li key={topic.path}>
                    <a href={topic.path}>{topic.name}</a>
                    <span className="meta">{topic.count} entries</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">New paths will appear as ideas connect.</p>}
          </RailSection>
        </aside>

        <aside className="side-right" aria-label="start reading">
          <RailSection heading="keep reading">
            <ul>
              <li><a href="/journal/">journal</a><span className="meta">essays</span></li>
              <li><a href="/making/">making</a><span className="meta">projects</span></li>
              <li><a href="/thoughts/">notebook</a><span className="meta">fragments</span></li>
              <li><a href="/feed.xml">rss</a><span className="meta">subscribe</span></li>
            </ul>
          </RailSection>
          <ElsewhereLinks links={site.links || []} />
        </aside>
      </main>
    </PageShell>
  );
}
