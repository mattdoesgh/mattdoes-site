import type { DateInput } from '../lib/format';
import { safeUrl } from '../lib/format';
import { Time } from './Time';
import { TagList } from './Tag';
import { TimelineRow } from './TimelineRow';

export interface ArticleRowProps {
  /** Permalink to the post. Sanitized before use. */
  url: string;
  /** Post title. */
  title: string;
  /** Publish date (absolute instant; rendered in Central Time). */
  date: DateInput;
  /** One-line summary, shown after the title with an em-dash. */
  summary?: string;
  /** Reading time, e.g. `"4 min"`. Shown in the gutter on single-kind lists. */
  readTime?: string;
  /** Post tags, rendered as inline chips. */
  tags?: string[];
  /** Post kind, e.g. `"journal"` / `"making"`. Required when `showKind`. */
  kind?: string;
  /**
   * Mixed-kind timeline (e.g. /blog/): lead the gutter with the kind label,
   * put the date in the second slot, and stamp `data-kind` for kind filtering.
   * Single-kind listings (`false`, default) lead with the date and show the
   * read time instead.
   */
  showKind?: boolean;
}

/** One article entry on a timeline (journal / making). */
export function ArticleRow({
  url,
  title,
  date,
  summary,
  readTime,
  tags,
  kind,
  showKind = false,
}: ArticleRowProps) {
  const rowKind = kind || (showKind ? kind : undefined);
  return (
    <TimelineRow
      kind={rowKind}
      tags={tags}
      gutter={
        <>
        <span className="kind">{showKind ? kind : <Time date={date} />}</span>
        <span className="when">{showKind ? <Time date={date} /> : readTime || ''}</span>
        </>
      }
    >
        <div className="body">
          <a href={safeUrl(url)}>
            <strong>{title}</strong>
          </a>
          {summary ? ` — ${summary}` : ''}{' '}
          <TagList tags={tags} />
        </div>
    </TimelineRow>
  );
}
