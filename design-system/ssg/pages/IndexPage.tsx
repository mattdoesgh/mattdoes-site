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
  place?: string;
}

export interface HomeShelf {
  dig?: { artist?: string; starter?: string; favorite?: boolean } | null;
  watch?: { title?: string; year?: string } | null;
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
  shelf?: HomeShelf;
}

const SHELVES = [
  { href: '/blog/', label: 'writing', note: 'essays and notes' },
  { href: '/thoughts/', label: 'thoughts', note: 'the notebook' },
  { href: '/listening/', label: 'listening', note: 'recent plays' },
  { href: '/digs/', label: 'digs', note: 'weekly music' },
  { href: '/movies/', label: 'movies', note: 'recent watches' },
  { href: '/grok/', label: 'grok says', note: 'recommendations' },
] as const;

function wordmark(site: IndexSite) {
  const identity = site.identity || {};
  const brand = (site.config?.title || '').split('.')[0] || identity.name || '';
  const nameLen = identity.name && brand.toLowerCase().startsWith(identity.name.toLowerCase())
    ? identity.name.length
    : brand.length;
  return { name: brand.slice(0, nameLen), dim: brand.slice(nameLen) };
}

function Lately({ site, shelf }: { site: IndexSite; shelf: HomeShelf }) {
  const dig = shelf.dig;
  const watch = shelf.watch;
  const rows = [
    { href: '/listening/', label: 'listening', value: site.nowPlaying || '' },
    { href: '/digs/', label: 'digs', value: dig ? [dig.artist, dig.starter].filter(Boolean).join(', ') : '' },
    { href: '/movies/', label: 'movies', value: watch ? `${watch.title || ''}${watch.year ? ` (${watch.year})` : ''}` : '' },
    { href: '/grok/', label: 'grok says', value: dig?.favorite ? (dig.artist || '') : '' },
  ];
  return (
    <dl className="home-lately">
      {rows.map((row) => (
        <div key={row.href}>
          <dt><a href={row.href}>{row.label}</a></dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function IndexPage({ site, editorial, shelf = {} }: IndexPageProps) {
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
            <p className="kicker">{site.config?.title || 'mattdoes.online'}</p>
            <h1 id="home-title">
              {name}
              {dim ? <span className="dim">{dim}</span> : null}
            </h1>
            {site.bio ? <p className="bio">{site.bio}</p> : null}
            {site.place ? <p className="where">{site.place}</p> : null}
            <p className="tagline">somewhere quiet on the wired</p>
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

          <section className="home-shelves" aria-labelledby="shelves-heading">
            <h2 id="shelves-heading">around here</h2>
            <ul className="rooms">
              {SHELVES.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>
                    <span className="label">{item.label}</span>
                    <span className="note">{item.note}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {editorial.recentWriting.length ? (
            <section className="home-recent" aria-label="recent writing">
              {editorial.recentWriting.map(entry => (
                <ArticleRow key={entry.url} {...entry} showKind />
              ))}
            </section>
          ) : null}

          <section className="home-wire" aria-labelledby="lately-heading">
            <h2 id="lately-heading">lately</h2>
            <Lately site={site} shelf={shelf} />
          </section>

          <a className="home-archive-link" href="/blog/">all writing →</a>
        </section>
      </main>
    </PageShell>
  );
}
