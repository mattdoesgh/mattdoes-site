// ListeningRow — the design-system / Claude Design mirror of one scrobble.
//
// SOURCE OF TRUTH IS templates/rows.js `listeningRow()`, NOT this file. The
// shipped /listening/ page does NOT render through this component: the build
// pre-renders rows with templates/rows.js and ListingPage injects them as
// `rowsHtml` (see design-system/ssg/pages/ListingPage.tsx, ADR 0001, and
// test/row-parity.test.js). That string module must stay byte-identical
// between the server render and static/listening-live.js's in-browser
// innerHTML swap — a guarantee React's serializer can't make, which is why
// the SSG keeps rows.js on the listening path.
//
// This component exists only as the @mattdoes/ds public API synced to Claude
// Design for visual editing. It is held to SEMANTIC (not byte) equivalence
// with listeningRow(); nothing mechanically enforces that, so when you change
// the scrobble markup, change templates/rows.js first and mirror it here.
import type { DateInput } from '../lib/format';
import { fmtDate, relValue, safeUrl } from '../lib/format';
import { Time } from './Time';

export interface ListeningRowProps {
  /** Track title. Falls back to `"(untitled)"`. */
  track?: string;
  /** Artist name. */
  artist?: string;
  /** Album name, shown muted after a middot. */
  album?: string;
  /** Last.fm link for the track. Sanitized; off-origin links get `rel`. */
  link?: string;
  /** When it was scrobbled (absolute instant; rendered in Central Time). */
  date: DateInput;
  /** Mark as the currently-playing track — shows a live dot and `now`. */
  nowPlaying?: boolean;
}

/**
 * One scrobble (listening entry). Design-system / Claude Design mirror of
 * templates/rows.js `listeningRow()` — semantic-equivalent, not the shipped
 * renderer (see the file header).
 */
export function ListeningRow({
  track,
  artist,
  album,
  link,
  date,
  nowPlaying,
}: ListeningRowProps) {
  const title = track || '(untitled)';
  const rel = relValue(link) ?? 'noopener';
  const strong = <strong>{title}</strong>;
  return (
    <div className="row">
      <div className="gutter">
        <span className="kind">
          {nowPlaying ? (
            <>
              <span className="dot now-dot"></span>now
            </>
          ) : (
            <Time date={date} />
          )}
        </span>
        <span className="when">{fmtDate(date, 'iso').slice(0, 4)}</span>
      </div>
      <div>
        <div className="body">
          {link ? (
            <a href={safeUrl(link)} rel={rel}>
              {strong}
            </a>
          ) : (
            strong
          )}
          {artist ? ` — ${artist}` : ''}
          {album ? (
            <>
              {' '}
              <span className="meta">· {album}</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
