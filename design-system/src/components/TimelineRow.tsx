import type { ReactNode } from 'react';

export interface TimelineRowProps {
  kind?: string;
  tags?: string[];
  gutter: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  featured?: boolean;
  className?: string;
}

/** Shared row shell for feed entries, preserving the `.row` data contract. */
export function TimelineRow({
  kind,
  tags = [],
  gutter,
  children,
  actions,
  featured = false,
  className = '',
}: TimelineRowProps) {
  const safeKind = kind ? kind.toLowerCase().replace(/[^a-z0-9-]+/g, '-') : '';
  const classes = ['row', safeKind ? `row--${safeKind}` : '', className].filter(Boolean).join(' ');
  return (
    <div
      className={classes}
      data-kind={kind || undefined}
      data-tags={tags.join(' ')}
      data-featured={featured ? 'true' : undefined}
    >
      <div className="gutter">{gutter}</div>
      <div>
        {children}
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </div>
  );
}
