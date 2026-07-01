import type { ReactNode } from 'react';
import { safeUrl } from '../lib/format';

export interface TimelineFilterLink {
  label: string;
  href: string;
  filter?: string;
  kindFilter?: string;
  all?: boolean;
  current?: boolean;
}

export interface TimelineFilterProps {
  links: TimelineFilterLink[];
  count: number;
  countLabel: string;
  label?: ReactNode;
}

/** Server-rendered fallback for the hydrated timeline controls island. */
export function TimelineFilter({ links, count, countLabel, label = 'filter' }: TimelineFilterProps) {
  if (!links.length) return null;
  return (
    <div
      className="filter"
      data-timeline-controls=""
      data-total={count}
      data-count-label={countLabel}
    >
      <div className="filter-main">
        <span className="label">{label}</span>
        <div className="filter-links">
          {links.map((link) => (
            <a
              key={`${link.kindFilter || ''}:${link.filter || ''}:${link.href}`}
              href={safeUrl(link.href)}
              className={[link.current ? 'on' : '', link.all ? 'all' : ''].filter(Boolean).join(' ') || undefined}
              data-filter={link.filter}
              data-kind-filter={link.kindFilter}
              aria-current={link.current ? 'true' : undefined}
            >
              {link.label}
            </a>
          ))}
        </div>
        <span className="cnt">
          {count} {countLabel}
        </span>
        <div className="timeline-density" role="group" aria-label="timeline density">
          <button type="button" data-density-choice="comfortable" aria-label="comfortable density" aria-pressed="true">
            comfort
          </button>
          <button type="button" data-density-choice="compact" aria-label="compact density" aria-pressed="false">
            compact
          </button>
        </div>
      </div>
    </div>
  );
}
