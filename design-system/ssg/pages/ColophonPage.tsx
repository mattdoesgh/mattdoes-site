// Colophon — static technical documentation. The long-form body contains
// deliberate preformatted whitespace, so it remains a raw HTML constant.
import { PageShell, Time, type DateInput } from '../../src/index';
import { COLOPHON_DOC_HTML } from './colophon-doc';

export interface ColophonStats {
  notesRead?: number | string;
  pagesWritten?: number | string;
  buildTime?: string;
  distSize?: string;
  buildLines?: number | string;
}

export interface ColophonSiteConfig {
  title?: string;
  links?: { label: string; href: string; meta?: string }[];
  footerText?: string;
  /** Manual topbar status override (siteConfig.status). */
  status?: string;
}

export interface ColophonPageProps {
  siteConfig: ColophonSiteConfig;
  stats?: ColophonStats;
  updated?: DateInput;
  nowPlaying?: string;
}

export function ColophonPage({ siteConfig, stats = {}, updated, nowPlaying = '' }: ColophonPageProps) {
  return (
    <PageShell
      active="colophon"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--single-column colophon-page" id="main">
        <article className="timeline colophon-document" aria-labelledby="colophon-title">
          <div className="post-head">
            <h1 id="colophon-title">colophon</h1>
            <p className="colophon-updated">updated <Time date={updated || new Date()} format="day" /></p>
          </div>

          <nav className="colophon-toc" aria-label="on this page">
            <ol>
              <li><a href="#folder">folder</a></li>
              <li><a href="#schema">frontmatter</a></li>
              <li><a href="#routing">routing</a></li>
              <li><a href="#wikilinks">wikilinks</a></li>
              <li><a href="#build">build</a></li>
            </ol>
          </nav>

          <div className="colophon-doc" dangerouslySetInnerHTML={{ __html: COLOPHON_DOC_HTML }} />

          <section className="colophon-build-stats" aria-labelledby="build-stats-title">
            <h2 id="build-stats-title">build snapshot</h2>
            <dl>
              <div><dt>notes read</dt><dd>{stats.notesRead ?? '—'}</dd></div>
              <div><dt>pages written</dt><dd>{stats.pagesWritten ?? '—'}</dd></div>
              <div><dt>build time</dt><dd>{stats.buildTime ?? '—'}</dd></div>
              <div><dt>dist size</dt><dd>{stats.distSize ?? '—'}</dd></div>
            </dl>
          </section>
        </article>
      </main>
    </PageShell>
  );
}
