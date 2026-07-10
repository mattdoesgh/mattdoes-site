// About — a single authored page with a small set of ways to connect after it.
import { PageShell, safeUrl, relValue } from '../../src/index';

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
  const links = (site.links || []).filter((link) => link.href);

  return (
    <PageShell
      active="about"
      siteTitle={site.config?.title}
      manualStatus={site.config?.status}
      nowPlaying={site.nowPlaying || ''}
      footerText={site.config?.footerText ?? ''}
    >
      <main className="page page--single-column about about-page" id="main">
        <article className="timeline" aria-labelledby="about-title">
          <div className="post-head">
            <h1 id="about-title">about</h1>
          </div>

          <div className="post-body" dangerouslySetInnerHTML={{ __html: note.html }} />

          {links.length ? (
            <nav className="about-links" aria-label="contact and profiles">
              <h2>elsewhere</h2>
              <ul>
                {links.map((link) => (
                  <li key={link.href}>
                    <a href={safeUrl(link.href)} rel={relValue(link.href)}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </article>
      </main>
    </PageShell>
  );
}
