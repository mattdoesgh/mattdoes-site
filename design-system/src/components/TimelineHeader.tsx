import type { ReactNode } from 'react';

export interface TimelineHeaderProps {
  title?: ReactNode;
  kicker?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}

/** Editorial heading block shared by feed and article-like timeline pages. */
export function TimelineHeader({ title, kicker, lede, actions }: TimelineHeaderProps) {
  if (!title && !kicker && !lede && !actions) return null;
  return (
    <div className="post-head timeline-head">
      {kicker ? <div className="kicker">{kicker}</div> : null}
      {title ? <h1>{title}</h1> : null}
      {lede ? <p className="lede">{lede}</p> : null}
      {actions ? <nav className="home-actions" aria-label="writing actions">{actions}</nav> : null}
    </div>
  );
}
