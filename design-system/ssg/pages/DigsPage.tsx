// /digs/ — weekly music picks. Data is content/digs/*.json, loaded by lib/digs.js.
import { PageShell, fmtIsoDay, safeUrl, relValue } from '../../src/index';
import { LogNav } from './log-nav';

export interface DigPick {
  id: string;
  artist: string;
  blurb: string;
  starter: string;
  favorite: boolean;
  appleMusic?: string;
  appleMusicEmbed?: string;
  bandcamp?: string;
  bandcampEmbed?: string;
}

export interface DigWeek {
  id: string;
  weekOf: string;
  sample: boolean;
  picks: DigPick[];
}

export interface DigsPageProps {
  siteConfig: { title?: string; footerText?: string; status?: string };
  weeks: DigWeek[];
  nowPlaying?: string;
}

function weekLabel(weekOf: string) {
  const day = fmtIsoDay(weekOf);
  const year = weekOf.slice(0, 4);
  return day ? `week of ${day} ${year}` : weekOf;
}

function playerSrc(url: string | undefined, host: string, pathPrefix = '') {
  const src = safeUrl(url || '');
  if (!src.startsWith('https://')) return '';
  try {
    const parsed = new URL(src);
    if (parsed.hostname !== host) return '';
    if (pathPrefix && !parsed.pathname.startsWith(pathPrefix)) return '';
    return src;
  } catch {
    return '';
  }
}

function Player({ src, title, height }: { src: string; title: string; height: number }) {
  return (
    <div className="dig-embed">
      <iframe
        title={title}
        src={src}
        height={height}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
        allow="autoplay *; encrypted-media *; fullscreen *"
        {...{ referrerpolicy: 'strict-origin-when-cross-origin' }}
      />
    </div>
  );
}

function Pick({ pick }: { pick: DigPick }) {
  const apple = playerSrc(pick.appleMusicEmbed, 'embed.music.apple.com');
  const bandcamp = playerSrc(pick.bandcampEmbed, 'bandcamp.com', '/EmbeddedPlayer/');
  const appleHref = safeUrl(pick.appleMusic || '');
  const bandHref = safeUrl(pick.bandcamp || '');
  return (
    <article className="dig-pick" id={pick.id}>
      <h3>
        {pick.artist}
        {pick.favorite ? <span className="dig-favorite">favorite</span> : null}
      </h3>
      <p className="dig-starter">{pick.starter}</p>
      <p>{pick.blurb}</p>
      {(appleHref || bandHref) ? (
        <p className="dig-links">
          {appleHref ? <a href={appleHref} rel={relValue(appleHref)}>apple music</a> : null}
          {bandHref ? <a href={bandHref} rel={relValue(bandHref)}>bandcamp</a> : null}
        </p>
      ) : null}
      {apple ? <Player src={apple} title={`Apple Music: ${pick.artist} — ${pick.starter}`} height={175} /> : null}
      {bandcamp ? <Player src={bandcamp} title={`Bandcamp: ${pick.artist} — ${pick.starter}`} height={120} /> : null}
    </article>
  );
}

function WeekBody({ week, titled }: { week: DigWeek; titled: boolean }) {
  return (
    <>
      {titled ? (
        <h2 id={`week-${week.id}`}>
          <time {...{ datetime: week.weekOf }}>{weekLabel(week.weekOf)}</time>
          {week.sample ? <span className="sample-flag">sample</span> : null}
        </h2>
      ) : null}
      {week.picks.map((pick) => <Pick key={pick.id} pick={pick} />)}
    </>
  );
}

export function DigsPage({ siteConfig, weeks, nowPlaying = '' }: DigsPageProps) {
  const [latest, ...older] = weeks;
  return (
    <PageShell
      active="digs"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--single-column digs-page" id="main">
        <article className="timeline">
          <div className="post-head">
            <h1 id="digs-title">digs</h1>
          </div>
          <LogNav current="digs" />

          {latest ? (
            <section className="dig-week" aria-labelledby={`week-${latest.id}`}>
              <WeekBody week={latest} titled />
            </section>
          ) : (
            <p className="muted">No digs yet.</p>
          )}

          {older.length ? (
            <div className="dig-archive">
              {older.map((week) => (
                <details key={week.id}>
                  <summary>
                    <h2>
                      <time {...{ datetime: week.weekOf }}>{weekLabel(week.weekOf)}</time>
                      {week.sample ? <span className="sample-flag">sample</span> : null}
                    </h2>
                  </summary>
                  <WeekBody week={week} titled={false} />
                </details>
              ))}
            </div>
          ) : null}
        </article>
      </main>
    </PageShell>
  );
}
