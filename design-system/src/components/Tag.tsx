import { Fragment } from 'react';

export interface TagProps {
  /** The tag label, e.g. `"css"`. */
  tag: string;
  /**
   * Page the tag scopes to. `''` (default) means the current page, so the
   * link is just `?tag=foo` and the client tag-filter can apply it in place.
   * Article/section pages pass e.g. `'/journal/'` to jump to that index
   * already filtered.
   */
  baseHref?: string;
}

/** A single inline tag chip: `<a class="tg" href="…?tag=…" data-tag="…">`. */
export function Tag({ tag, baseHref = '' }: TagProps) {
  return (
    <a className="tg" href={`${baseHref}?tag=${encodeURIComponent(tag)}`} data-tag={tag}>
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
