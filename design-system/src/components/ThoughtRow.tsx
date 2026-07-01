import type { ReactNode } from 'react';
import type { DateInput } from '../lib/format';
import { tagsHtml } from '../lib/format';
import { Time } from './Time';
import { TagList } from './Tag';
import { TimelineRow } from './TimelineRow';

export interface ThoughtRowProps {
  /** Timestamp of the thought (absolute; rendered in Central Time). */
  date: DateInput;
  /**
   * Pre-rendered markdown HTML for the body — the migration bridge from the
   * build's `marked` output. Mutually exclusive with `children`; when set, the
   * body (and any appended tags) render via `dangerouslySetInnerHTML`.
   */
  html?: string;
  /** Body composed as React nodes — the clean authoring path. */
  children?: ReactNode;
  /** Stable fragment id, e.g. `t-20260617-0930`; renders the `#…` permalink. */
  id?: string;
  /** Tags, appended inline after the body (suppressed for quote thoughts). */
  tags?: string[];
  /** Render the body as a pull-quote (italic `.body.q` variant). */
  quote?: boolean;
}

/** One micro-post (thought) on a timeline. */
export function ThoughtRow({ date, html, children, id, tags, quote }: ThoughtRowProps) {
  const bodyClass = quote ? 'body q' : 'body';
  const showTags = !quote && !!tags && tags.length > 0;
  return (
    <TimelineRow
      kind="thought"
      tags={tags}
      gutter={
        <>
        <span className="kind">thought</span>
        <span className="when">
          <Time date={date} />
        </span>
        </>
      }
      actions={id ? (
        <a className="permalink" href={`#${id}`} id={id} aria-label="permalink to this thought">
          #{id}
        </a>
      ) : null}
    >
        {html != null ? (
          <div
            className={bodyClass}
            dangerouslySetInnerHTML={{
              __html: showTags ? `${html} ${tagsHtml(tags!)}` : html,
            }}
          />
        ) : (
          <div className={bodyClass}>
            {children}
            {showTags ? (
              <>
                {' '}
                <TagList tags={tags} />
              </>
            ) : null}
          </div>
        )}
    </TimelineRow>
  );
}
