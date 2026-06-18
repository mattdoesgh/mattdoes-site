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

/** One scrobble (listening entry). Server- and client-rendered identically. */
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
