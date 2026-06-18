import { safeUrl, relValue } from '../lib/format';

export interface ExternalLink {
  label: string;
  href: string;
  /** Optional secondary text shown after the label (e.g. a handle or ↗). */
  meta?: string;
}

export interface ElsewhereLinksProps {
  /** Links to render; entries without an href are dropped. */
  links: ExternalLink[];
  /** Group heading. Defaults to `"elsewhere"`. */
  heading?: string;
}

/**
 * A left-rail link group (`<div class="group"><h2>elsewhere</h2><ul>…`). Off-site
 * links are sanitized (`safeUrl`) and get `rel` (`relValue`). Renders nothing
 * when there are no linkable entries. Shared by the home / blog / listing /
 * about rails, which all rendered this block identically.
 */
export function ElsewhereLinks({ links, heading = 'elsewhere' }: ElsewhereLinksProps) {
  const shown = links.filter((l) => l.href);
  if (!shown.length) return null;
  return (
    <div className="group">
      <h2>{heading}</h2>
      <ul>
        {shown.map((l) => (
          <li key={l.href}>
            <a href={safeUrl(l.href)} rel={relValue(l.href)}>
              {l.label}
            </a>
            {l.meta ? <span className="meta">{l.meta}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
