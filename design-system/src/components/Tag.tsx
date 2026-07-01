import { Fragment } from 'react';

export interface TagProps {
  /** The tag label, e.g. `"css"`. */
  tag: string;
  /**
   * Page the tag scopes to. `''` (default) means the current page, so the
   * link is just `?tag=foo` and the timeline controls can apply it in place.
   * Article/section pages pass e.g. `'/journal/'` to jump to that index
   * already filtered.
   */
  baseHref?: string;
  /**
   * Extra query params placed before `tag=` — e.g. `{ kind: 'journal' }` yields
   * `?kind=journal&tag=…`. Used by article pages whose chips jump to a
   * kind-filtered /blog/ view.
   */
  params?: Record<string, string>;
}

/** A single inline tag chip: `<a class="tg" href="…?tag=…" data-tag="…">`. */
export function Tag({ tag, baseHref = '', params }: TagProps) {
  const prefix = params
    ? Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}&`)
        .join('')
    : '';
  return (
    <a className="tg" href={`${baseHref}?${prefix}tag=${encodeURIComponent(tag)}`} data-tag={tag}>
      {tag}
    </a>
  );
}

export interface TagListProps {
  /** The tags to render. Renders nothing when empty/absent. */
  tags?: string[];
  /** Forwarded to each `Tag` — the page tag clicks scope to. */
  baseHref?: string;
}

/** A run of inline tag chips, space-separated (matches `tagList()` output). */
export function TagList({ tags, baseHref = '' }: TagListProps) {
  if (!tags || !tags.length) return null;
  return (
    <>
      {tags.map((t, i) => (
        <Fragment key={t}>
          {i > 0 ? ' ' : null}
          <Tag tag={t} baseHref={baseHref} />
        </Fragment>
      ))}
    </>
  );
}
