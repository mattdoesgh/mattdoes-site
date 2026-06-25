// /search/ — static shell with client-side index lookup.
import { PageShell, IdentityRail } from '../../src/index';

export interface SearchPageProps {
  siteConfig: {
    title?: string;
    footerText?: string;
    status?: string;
    identity?: { name?: string; bio?: string };
  };
}

export function SearchPage({ siteConfig }: SearchPageProps) {
  const identity = siteConfig.identity || {};
  return (
    <PageShell
      active="search"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page" id="main">
        <h1 className="visually-hidden">search</h1>

        <IdentityRail who={identity.name} bio={identity.bio || 'Search the archive.'} />

        <section className="timeline">
          <div className="post-head">
            <div className="kicker">
              <span className="kind">search</span>
            </div>
            <p className="lede">Find posts by title, tag, or summary. Works offline once the index is cached.</p>
          </div>

          <form id="search-form" className="search-form" role="search" action="/search/" method="get">
            <label htmlFor="search-q" className="visually-hidden">
              Search
            </label>
            <input id="search-q" name="q" type="search" />
            <button type="submit">search</button>
          </form>
          <p id="search-status" className="muted search-status" aria-live="polite"></p>
          <div id="search-results" className="search-results" aria-live="polite"></div>
        </section>
      </main>
    </PageShell>
  );
}
