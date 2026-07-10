// Listing — reverse-chrono index for article kinds and /listening/.
// Thoughts use the dedicated reader-shaped ThoughtsPage.
//
// LISTENING IS SPECIAL (ADR 0001 + test/row-parity.test.js): the /listening/
// rows must byte-equal templates/rows.js `listeningRow()` output because
// static/listening-live.js re-renders them in the browser from that same
// module and dedupes by an innerHTML swap. React serialization would not
// byte-match, so the build pre-renders the listening rows with rows.js and
// passes them here as `rowsHtml`, injected verbatim into `#listening-rows`.
// React owns the page frame; rows.js owns the listening row bytes.
import {
  PageShell,
  IdentityRail,
  ElsewhereLinks,
  ArticleRow,
  EmptyState,
  TimelineFilter,
  TimelineHeader,
  type DateInput,
  type EmptyKind,
} from '../../src/index';
// The one owner of the #scrobble-count format string, shared with
// static/listening-live.js so the live update can't drift.
import { formatScrobbleCount } from '../../../templates/_helpers.js';

const SECTION_PATH: Record<string, string> = {
  journal: '/journal/',
  making: '/making/',
  listening: '/listening/',
};

export interface ListingEntry {
  kind?: string;
  url?: string;
  title?: string;
  date: DateInput;
  summary?: string;
  readTime?: string;
  tags?: string[];
  tagPaths?: Record<string, string>;
}

export interface ListingSiteConfig {
  title?: string;
  sections?: Record<string, { who?: string; bio?: string; intro?: string }>;
  links?: { label: string; href: string; meta?: string }[];
  lastfm?: { username?: string; showUser?: boolean };
  footerText?: string;
  /** Manual topbar status override (siteConfig.status). */
  status?: string;
}

export interface ListingPageProps {
  siteConfig: ListingSiteConfig;
  kind: 'journal' | 'making' | 'listening';
  entries: ListingEntry[];
  nowPlaying?: string;
  totalScrobbles?: number;
  /** Pre-rendered listening rows (rows.js output). Required for kind==='listening'. */
  rowsHtml?: string;
}

export function ListingPage({
  siteConfig,
  kind,
  entries,
  nowPlaying = '',
  totalScrobbles = 0,
  rowsHtml = '',
}: ListingPageProps) {
  const section = siteConfig.sections?.[kind] || {};
  const isListening = kind === 'listening';
  const showLastfm = isListening && siteConfig.lastfm?.showUser && siteConfig.lastfm?.username;

  const statLabel = isListening ? 'scrobbles' : 'posts';
  const statValue = isListening ? formatScrobbleCount(totalScrobbles) : String(entries.length);

  // Tag index (only meaningful for article kinds).
  const tagCounts = new Map<string, number>();
  if (!isListening) for (const e of entries) for (const t of e.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sectionPath = SECTION_PATH[kind] || '/';
  const filterLinks = topTags.length
    ? [
        { label: 'all', href: sectionPath, filter: '', all: true, current: true },
        ...topTags.slice(0, 8).map(([tag]) => ({
          label: tag,
          href: `${sectionPath}?tag=${encodeURIComponent(tag)}`,
          filter: tag,
        })),
      ]
    : [];

  return (
    <PageShell
      active={kind}
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page" id="main">
        <IdentityRail
          who={section.who}
          bio={section.bio}
          stats={[{ n: statValue, label: statLabel, id: isListening ? 'scrobble-count' : undefined }]}
        >
          {showLastfm ? (
            <div className="group">
              <h2>
                source <span className="m">last.fm</span>
              </h2>
              <ul>
                <li>
                  <a
                    href={`https://www.last.fm/user/${encodeURIComponent(siteConfig.lastfm!.username!)}`}
                    rel="noopener noreferrer"
                  >
                    last.fm/{siteConfig.lastfm!.username}
                  </a>
                  <span className="meta">↗</span>
                </li>
              </ul>
            </div>
          ) : null}

          <ElsewhereLinks links={siteConfig.links || []} />
        </IdentityRail>

        <section className="timeline">
          <TimelineHeader
            title={section.who || kind}
            kicker={<span className="kind">{kind}</span>}
            lede={section.intro}
          />

          <TimelineFilter links={filterLinks} count={entries.length} countLabel={statLabel} />

          {isListening ? (
            <div id="listening-rows" dangerouslySetInnerHTML={{ __html: rowsHtml }} />
          ) : entries.length ? (
            entries.map((e, i) => (
              <ArticleRow
                key={e.url || i}
                url={e.url || ''}
                title={e.title || ''}
                date={e.date}
                summary={e.summary}
                readTime={e.readTime}
                tags={e.tags}
                tagPaths={e.tagPaths}
                kind={kind}
              />
            ))
          ) : (
            <EmptyState kind={kind as EmptyKind} />
          )}
        </section>

        {/* No TagCloud rail: the filter row above the stream already exposes
            the top tags — a second aggregate tag list was pure repetition. */}
      </main>
    </PageShell>
  );
}
