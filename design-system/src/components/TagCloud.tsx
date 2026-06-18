import { Tag } from './Tag';

export interface TagCloudProps {
  /** `[tag, count]` pairs, already ordered. Renders nothing when empty. */
  tags: [string, number][];
  /** Forwarded to each `Tag` — the page tag clicks scope to. */
  baseHref?: string;
  /** Group heading. Defaults to `"by tag"`. */
  heading?: string;
}

/**
 * The right-rail "by tag" group: a heading and a list of `Tag` chips each with
 * its occurrence count. Shared by the blog and section-listing pages, which
 * rendered this block identically.
 */
export function TagCloud({ tags, baseHref = '', heading = 'by tag' }: TagCloudProps) {
  if (!tags.length) return null;
  return (
    <div className="group">
      <h2>{heading}</h2>
      <ul>
        {tags.map(([t, n]) => (
          <li key={t}>
            <Tag tag={t} baseHref={baseHref} />
            <span className="meta">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
