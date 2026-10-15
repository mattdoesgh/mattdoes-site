// /grok/ — recommendations hub. Favorite digs are read from the digs weeks
// (lib/digs.js favoritePicks); this page does not keep its own copy. Other
// picks come from content/recommendations.json. Movie watches stay on /movies/.
import { PageShell, safeUrl, relValue } from '../../src/index';
import { LogNav } from './log-nav';

export interface GrokFavorite {
  id: string;
  artist: string;
  starter: string;
  weekOf: string;
  sample?: boolean;
}

export interface GrokPick {
  id: string;
  title: string;
  detail: string;
  href?: string;
  kind?: string;
  sample?: boolean;
}

export interface GrokPageProps {
  siteConfig: { title?: string; footerText?: string; status?: string };
  favorites: GrokFavorite[];
  picks: GrokPick[];
  nowPlaying?: string;
}

export function GrokPage({ siteConfig, favorites, picks, nowPlaying = '' }: GrokPageProps) {
  return (
    <PageShell
      active="grok"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--single-column grok-page" id="main">
        <article className="timeline">
          <div className="post-head">
            <h1 id="grok-title">grok says…</h1>
          </div>
          <LogNav current="grok" />

          <section className="grok-section" aria-labelledby="grok-digs">
            <h2 id="grok-digs">digs</h2>
            {favorites.length ? (
              <ul className="grok-list">
                {favorites.map((pick) => (
                  <li key={pick.id}>
                    <a href={`/digs/#${pick.id}`}>{pick.artist}</a>
                    <span className="meta"> — {pick.starter}</span>
                    {pick.sample ? <span className="sample-flag">sample</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No favorites yet.</p>
            )}
            <p className="log-source"><a href="/digs/">all digs</a></p>
          </section>

          {picks.length ? (
            <section className="grok-section" aria-labelledby="grok-other">
              <h2 id="grok-other">also</h2>
              <ul className="grok-list">
                {picks.map((pick) => {
                  const href = safeUrl(pick.href || '');
                  return (
                    <li key={pick.id}>
                      {pick.kind ? <span className="meta">{pick.kind} · </span> : null}
                      {href ? <a href={href} rel={relValue(href)}>{pick.title}</a> : pick.title}
                      {pick.sample ? <span className="sample-flag">sample</span> : null}
                      <span className="grok-detail">{pick.detail}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </article>
      </main>
    </PageShell>
  );
}
