// Listing — reverse-chrono index for /journal/, /making/, /thoughts/,
// /listening/. The React mirror of templates/listing.js (one component, four
// call sites).
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
  ThoughtRow,
  EmptyState,
  TagCloud,
  TimelineFilter,
  TimelineHeader,
  type DateInput,
  type EmptyKind,
} from '../../src/index';

const SECTION_PATH: Record<string, string> = {
  journal: '/journal/',
  making: '/making/',
  listening: '/listening/',
  thoughts: '/thoughts/',
};

export interface ListingEntry {
  kind?: string;
  url?: string;
  title?: string;
  date: DateInput;
  summary?: string;
  readTime?: string;
  tags?: string[];
  // thought fields
  id?: string;
  html?: string;
  quote?: boolean;
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
  kind: 'journal' | 'making' | 'thoughts' | 'listening';
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
  const statValue = isListening ? Number(totalScrobbles || 0).toLocaleString('en-US') : String(entries.length);

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
            entries.map((e, i) =>
              kind === 'thoughts' ? (
                <ThoughtRow key={e.id || i} date={e.date} html={e.html} id={e.id} tags={e.tags} quote={e.quote} />
              ) : (
                <ArticleRow
                  key={e.url || i}
                  url={e.url || ''}
                  title={e.title || ''}
                  date={e.date}
                  summary={e.summary}
                  readTime={e.readTime}
                  tags={e.tags}
                  kind={kind}
                />
              ),
            )
          ) : (
            <EmptyState kind={kind as EmptyKind} />
          )}
        </section>

        <aside className="side-right" aria-label="related">
          <TagCloud tags={topTags} baseHref={sectionPath} />
        </aside>
      </main>
    </PageShell>
  );
}
