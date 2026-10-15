// /movies/ — recent Letterboxd watches. The list is a build-time snapshot
// (lib/watches.js), capped at the recent window. No embedded feed.
import { PageShell, fmtIsoDay, safeUrl, relValue } from '../../src/index';
import { LogNav } from './log-nav';

export interface Watch {
  title: string;
  year?: string;
  rating?: number | null;
  stars?: string;
  watchedDate?: string;
  rewatch?: boolean;
  link?: string;
  review?: string;
}

export interface MoviesPageProps {
  siteConfig: { title?: string; footerText?: string; status?: string };
  watches: Watch[];
  profileHref?: string;
  nowPlaying?: string;
}

function WatchRow({ watch }: { watch: Watch }) {
  const href = safeUrl(watch.link || '');
  const when = watch.watchedDate || '';
  const rating = typeof watch.rating === 'number' && watch.rating > 0 ? watch.rating : null;
  return (
    <div className="row">
      <div className="gutter">
        <span className="kind">
          {when ? <time {...{ datetime: when }}>{fmtIsoDay(when)}</time> : '—'}
        </span>
        <span className="when">{watch.year || ''}</span>
      </div>
      <div>
        <div className="body">
          {href ? (
            <a href={href} rel={relValue(href)}><strong>{watch.title}</strong></a>
          ) : (
            <strong>{watch.title}</strong>
          )}
          {watch.stars ? (
            <>
              <span aria-hidden="true"> {watch.stars}</span>
              {rating != null ? <span className="visually-hidden">, rated {rating} out of 5</span> : null}
            </>
          ) : null}
          {watch.rewatch ? <span className="meta"> · rewatch</span> : null}
          {watch.review ? ` — ${watch.review}` : null}
        </div>
      </div>
    </div>
  );
}

export function MoviesPage({
  siteConfig,
  watches,
  profileHref = 'https://letterboxd.com/mattdoes',
  nowPlaying = '',
}: MoviesPageProps) {
  const profile = safeUrl(profileHref);
  return (
    <PageShell
      active="movies"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--archive movies-page" id="main">
        <section className="timeline archive-listing" aria-labelledby="movies-title">
          <div className="post-head">
            <h1 id="movies-title">movies</h1>
          </div>
          <LogNav current="movies" />

          {watches.length ? (
            watches.map((watch) => (
              <WatchRow key={`${watch.link || watch.title}-${watch.watchedDate || ''}`} watch={watch} />
            ))
          ) : (
            <p className="muted">No recent watches in this build.</p>
          )}

          {profile ? (
            <p className="log-source">
              <a href={profile} rel={relValue(profile)}>letterboxd</a>
            </p>
          ) : null}
        </section>
      </main>
    </PageShell>
  );
}
