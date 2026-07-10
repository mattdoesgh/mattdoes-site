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
  /** Normalized tag name → canonical Topic path. */
  tagPaths?: Record<string, string>;
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
  tagPaths,
}: ArticleRowProps) {
  return (
    <TimelineRow
      kind={kind}
      tags={tags}
      className="article-row"
      gutter={
        <>
          <span className="kind">{showKind ? kind : <Time date={date} />}</span>
          <span className="when">{showKind ? <Time date={date} /> : readTime || ''}</span>
        </>
      }
    >
      <div className="body article-row__body">
        <a className="article-row__title" href={safeUrl(url)}>
          <strong>{title}</strong>
        </a>
        {summary ? <span className="article-row__summary">{summary}</span> : null}
        {tags?.length ? (
          <span className="article-row__tags">
            <TagList tags={tags} tagPaths={tagPaths} />
          </span>
        ) : null}
      </div>
    </TimelineRow>
  );
}
