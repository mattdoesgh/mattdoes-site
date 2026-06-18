// About — single static page; body comes from a vault note with
// `publish: about`. React mirror of templates/about.js. Mirrors the article
// shell but strips post-specific chrome (kicker, read time, tags, pager).
import { PageShell, IdentityRail, ElsewhereLinks } from '../../src/index';

export interface AboutNote {
  summary?: string;
  html: string;
}

export interface AboutSite {
  config?: { title?: string; footerText?: string; status?: string };
  links?: { label: string; href: string; meta?: string }[];
  identity?: { bio?: string };
  nowPlaying?: string;
}

export interface AboutPageProps {
  site: AboutSite;
  note: AboutNote;
}

export function AboutPage({ site, note }: AboutPageProps) {
  return (
    <PageShell
      active="about"
      siteTitle={site.config?.title}
      manualStatus={site.config?.status}
      nowPlaying={site.nowPlaying || ''}
      footerText={site.config?.footerText ?? ''}
    >
      <main className="page about" id="main">
        <IdentityRail who="about" bio={site.identity?.bio}>
          <ElsewhereLinks links={site.links || []} />
        </IdentityRail>

        <article className="timeline">
          <div className="post-head">
            <h1>About me</h1>
            {note.summary ? <p className="lede">{note.summary}</p> : null}
          </div>

          <div className="post-body" dangerouslySetInnerHTML={{ __html: note.html }} />
        </article>
      </main>
    </PageShell>
  );
}
