// /search/ — static shell with client-side index lookup.
import { PageShell } from '../../src/index';

export interface SearchPageProps {
  siteConfig: {
    title?: string;
    footerText?: string;
    status?: string;
    identity?: { name?: string; bio?: string };
  };
}

export function SearchPage({ siteConfig }: SearchPageProps) {
  return (
    <PageShell
      active="search"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--single-column search-page" id="main">
        <section className="timeline" aria-labelledby="search-title">
          <h1 id="search-title">search</h1>

          <form id="search-form" className="search-form" role="search" action="/search/" method="get">
            <label htmlFor="search-q" className="visually-hidden">
              Search
            </label>
            <input id="search-q" name="q" type="search" placeholder="Search writing" />
            <button type="submit">search</button>
          </form>
          <p id="search-status" className="muted search-status" aria-live="polite"></p>
          <div id="search-results" className="search-results" aria-live="polite"></div>
        </section>
      </main>
    </PageShell>
  );
}
