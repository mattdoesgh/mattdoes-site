// /listening/ — live track list.
//
// The rows must byte-equal templates/rows.js `listeningRow()` output because
// static/listening-live.js re-renders them in the browser from that same
// module and dedupes by an innerHTML swap. React serialization would not
// byte-match, so the build pre-renders the rows with rows.js and passes
// them here as `rowsHtml`, injected verbatim into `#listening-rows`.
import { PageShell, TimelineHeader } from '../../src/index';
import { formatScrobbleCount } from '../../../templates/_helpers.js';

export interface ListingSiteConfig {
  title?: string;
  sections?: Record<string, { who?: string; bio?: string; intro?: string }>;
  footerText?: string;
  /** Manual topbar status override (siteConfig.status). */
  status?: string;
}

export interface ListingPageProps {
  siteConfig: ListingSiteConfig;
  nowPlaying?: string;
  totalScrobbles?: number;
  /** Pre-rendered listening rows (rows.js output). */
  rowsHtml?: string;
}

export function ListingPage({
  siteConfig,
  nowPlaying = '',
  totalScrobbles = 0,
  rowsHtml = '',
}: ListingPageProps) {
  const section = siteConfig.sections?.listening || {};

  return (
    <PageShell
      active="listening"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--archive page--listening" id="main">
        <section className="timeline archive-listing">
          <TimelineHeader title={section.who || 'listening'} />
          <span id="scrobble-count">{formatScrobbleCount(totalScrobbles)}</span>
          <div id="listening-rows" dangerouslySetInnerHTML={{ __html: rowsHtml }} />
        </section>
      </main>
    </PageShell>
  );
}
