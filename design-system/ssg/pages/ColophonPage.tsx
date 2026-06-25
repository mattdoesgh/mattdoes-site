// Colophon — static doc page about how the site is put together. React mirror
// of templates/colophon.js. The frame (chrome, rails, build stats) is React;
// the long-form documentation middle — a <pre> folder tree, a schema table,
// routing/wikilink/build sections with significant pre-formatted whitespace —
// is the verbatim COLOPHON_DOC_HTML constant (./colophon-doc) injected here, so
// that whitespace stays byte-faithful (it must, inside <pre>).
import { PageShell, IdentityRail, Time, safeUrl, relValue, type DateInput } from '../../src/index';
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
  const links = (siteConfig.links || []).filter((l) => l.href);

  return (
    <PageShell
      active="colophon"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page" id="main">
        <IdentityRail
          who="colophon"
          bio="How this site is put together. Obsidian vault → Node build → React-rendered static HTML. R2 holds media; two thin Workers — listening + geo — handle the live bits. KV caches both upstreams so request paths never block."
        >
          <div className="group">
            <h2>on this page</h2>
            <ul>
              <li>
                <a href="#folder">folder layout</a>
                <span className="meta">01</span>
              </li>
              <li>
                <a href="#schema">frontmatter</a>
                <span className="meta">02</span>
              </li>
              <li>
                <a href="#routing">routing</a>
                <span className="meta">03</span>
              </li>
              <li>
                <a href="#wikilinks">wikilinks</a>
                <span className="meta">04</span>
              </li>
              <li>
                <a href="#build">the build</a>
                <span className="meta">05</span>
              </li>
            </ul>
          </div>

          {links.length ? (
            <div className="group">
              <h2>source</h2>
              <ul>
                {links.map((l) => (
                  <li key={l.href}>
                    <a href={safeUrl(l.href)} rel={relValue(l.href)}>
                      {l.label}
                    </a>
                    {l.meta ? <span className="meta">{l.meta}</span> : null}
                  </li>
                ))}
                <li>
                  <span>build.js + lib/</span>
                  <span className="meta">{stats.buildLines || '—'} ln</span>
                </li>
              </ul>
            </div>
          ) : null}
        </IdentityRail>

        <section className="timeline">
          <div className="post-head">
            <div className="kicker">
              <span className="kind">docs</span>
              <span className="dot">·</span>
              <span>
                updated <Time date={updated || new Date()} format="day" />
              </span>
            </div>
            <h1>colophon.</h1>
            <p className="lede">
              The Obsidian vault is the source of truth; a small build script turns it into the pages you're reading.
            </p>
          </div>

          <div dangerouslySetInnerHTML={{ __html: COLOPHON_DOC_HTML }} />
        </section>

        <aside className="side-right" aria-label="related">
          <div className="group">
            <h2>build stats</h2>
            <ul>
              <li>
                <span>notes read</span>
                <span className="meta">{stats.notesRead ?? '—'}</span>
              </li>
              <li>
                <span>pages written</span>
                <span className="meta">{stats.pagesWritten ?? '—'}</span>
              </li>
              <li>
                <span>build time</span>
                <span className="meta">{stats.buildTime ?? '—'}</span>
              </li>
              <li>
                <span>dist size</span>
                <span className="meta">{stats.distSize ?? '—'}</span>
              </li>
            </ul>
          </div>

          <div className="group">
            <h2>stack</h2>
            <ul>
              <li>
                <span>Obsidian</span>
                <span className="meta">vault</span>
              </li>
              <li>
                <span>Node</span>
                <span className="meta">build</span>
              </li>
              <li>
                <span>React + TS</span>
                <span className="meta">pages</span>
              </li>
              <li>
                <span>marked + yaml</span>
                <span className="meta">md</span>
              </li>
              <li>
                <span>shiki</span>
                <span className="meta">code hl</span>
              </li>
              <li>
                <span>marked-footnote</span>
                <span className="meta">md ext</span>
              </li>
              <li>
                <span>lightningcss + terser</span>
                <span className="meta">assets</span>
              </li>
              <li>
                <span>sharp</span>
                <span className="meta">img</span>
              </li>
              <li>
                <span>CF Pages</span>
                <span className="meta">host</span>
              </li>
              <li>
                <span>R2</span>
                <span className="meta">media</span>
              </li>
              <li>
                <span>CF Worker</span>
                <span className="meta">listening</span>
              </li>
              <li>
                <span>CF Worker</span>
                <span className="meta">geo</span>
              </li>
              <li>
                <span>CF Worker</span>
                <span className="meta">csp-report</span>
              </li>
              <li>
                <span>CF KV</span>
                <span className="meta">cache</span>
              </li>
              <li>
                <span>Fastmail</span>
                <span className="meta">mail</span>
              </li>
            </ul>
          </div>
        </aside>
      </main>
    </PageShell>
  );
}
