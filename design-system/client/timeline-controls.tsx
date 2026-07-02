import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Density = 'comfortable' | 'compact';

interface FilterOption {
  label: string;
  href: string;
  filter?: string;
  kindFilter?: string;
  all?: boolean;
}

interface Filters {
  tag: string;
  kind: string;
}

interface MountData {
  root: HTMLElement;
  timeline: HTMLElement;
  options: FilterOption[];
  total: number;
  countLabel: string;
}

const DENSITY_KEY = 'mdo:timeline-density:v1';

function readFiltersFromUrl(): Filters {
  const params = new URLSearchParams(window.location.search);
  return {
    tag: params.get('tag') || '',
    kind: params.get('kind') || '',
  };
}

function buildUrl(next: Filters) {
  const params = new URLSearchParams();
  if (next.kind) params.set('kind', next.kind);
  if (next.tag) params.set('tag', next.tag);
  const qs = params.toString();
  return qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
}

function readDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

function saveDensity(density: Density) {
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // Non-critical preference persistence.
  }
}

function rows(timeline: HTMLElement) {
  return [...timeline.querySelectorAll<HTMLElement>('.row[data-tags]')];
}

function dividers(timeline: HTMLElement) {
  return [...timeline.querySelectorAll<HTMLElement>('.tl-divider')];
}

function applyFilter(timeline: HTMLElement, filters: Filters) {
  const tag = filters.tag || '';
  const kind = filters.kind || '';
  let visible = 0;
  const allRows = rows(timeline);

  for (const row of allRows) {
    const tags = (row.dataset.tags || '').split(' ').filter(Boolean);
    const tagMatch = !tag || tags.includes(tag);
    const kindMatch = !kind || row.dataset.kind === kind;
    const show = tagMatch && kindMatch;
    row.hidden = !show;
    if (show) visible += 1;
  }

  for (const divider of dividers(timeline)) {
    let node = divider.nextElementSibling;
    let groupVisible = 0;
    while (node && !node.classList.contains('tl-divider')) {
      if (node.classList.contains('row') && !(node as HTMLElement).hidden) groupVisible += 1;
      node = node.nextElementSibling;
    }
    divider.hidden = groupVisible === 0;
  }

  return { visible, total: allRows.length };
}

function readMountData(root: HTMLElement): MountData | null {
  const timeline = root.closest<HTMLElement>('.timeline');
  if (!timeline) return null;

  const options = [...root.querySelectorAll<HTMLAnchorElement>('a')].map((a) => ({
    label: a.textContent?.trim() || '',
    href: a.getAttribute('href') || window.location.pathname,
    filter: a.hasAttribute('data-filter') ? a.dataset.filter || '' : undefined,
    kindFilter: a.hasAttribute('data-kind-filter') ? a.dataset.kindFilter || '' : undefined,
    all: a.classList.contains('all'),
  }));

  return {
    root,
    timeline,
    options,
    total: Number(root.dataset.total || rows(timeline).length || 0),
    countLabel: root.dataset.countLabel || 'entries',
  };
}

function isSamePageHref(href: string) {
  try {
    return new URL(href, window.location.href).pathname === window.location.pathname;
  } catch {
    return false;
  }
}

type ClickLike = Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'button'>;

function isModifiedClick(event: ClickLike) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0;
}

function TimelineControls({ root, timeline, options, total, countLabel }: MountData) {
  const [filters, setFilters] = useState(readFiltersFromUrl);
  const [density, setDensity] = useState<Density>(readDensity);
  const [visible, setVisible] = useState(total);
  const active = !!(filters.tag || filters.kind);

  useEffect(() => {
    const result = applyFilter(timeline, filters);
    setVisible(result.visible);
  }, [timeline, filters]);

  useEffect(() => {
    timeline.dataset.density = density;
    root.dataset.density = density;
    saveDensity(density);
  }, [density, root, timeline]);

  useEffect(() => {
    const onPopState = () => setFilters(readFiltersFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a.tg[data-tag]');
      if (!anchor || isModifiedClick(event) || !isSamePageHref(anchor.href)) return;
      event.preventDefault();
      navigate({ tag: anchor.dataset.tag || '', kind: filters.kind });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [filters.kind]);

  const status = useMemo(() => {
    const base = `showing ${visible} of ${total} ${countLabel}`;
    if (!active) return base;
    const facets = [];
    if (filters.kind) facets.push(`kind ${filters.kind}`);
    if (filters.tag) facets.push(`tag ${filters.tag}`);
    return `filtered by ${facets.join(' and ')}: ${base}`;
  }, [active, countLabel, filters.kind, filters.tag, total, visible]);

  function navigate(next: Filters) {
    window.history.pushState(next, '', buildUrl(next));
    setFilters(next);
  }

  function optionActive(option: FilterOption) {
    if (option.all) return !filters.tag && !filters.kind;
    const tagActive = option.filter !== undefined && option.filter === filters.tag;
    const kindActive = option.kindFilter !== undefined && option.kindFilter === filters.kind;
    return tagActive || kindActive;
  }

  function optionFilters(option: FilterOption): Filters {
    if (option.all) return { tag: '', kind: '' };
    if (option.kindFilter !== undefined) return { tag: filters.tag, kind: option.kindFilter || '' };
    if (option.filter !== undefined) return { tag: option.filter || '', kind: filters.kind };
    return filters;
  }

  return (
    <>
      <div className="filter-main">
        <span className="label">filter</span>
        <div className="filter-links">
          {options.map((option) => {
            const on = optionActive(option);
            return (
              <a
                key={`${option.kindFilter || ''}:${option.filter || ''}:${option.href}`}
                href={option.href}
                className={[on ? 'on' : '', option.all ? 'all' : ''].filter(Boolean).join(' ') || undefined}
                data-filter={option.filter}
                data-kind-filter={option.kindFilter}
                aria-current={on ? 'true' : undefined}
                onClick={(event) => {
                  if (isModifiedClick(event) || !isSamePageHref(option.href)) return;
                  event.preventDefault();
                  navigate(optionFilters(option));
                }}
              >
                {option.label}
              </a>
            );
          })}
        </div>
        <span className="cnt">
          {visible === total ? `${total} ${countLabel}` : `${visible} ${countLabel}`}
        </span>
        <div className="timeline-density" role="group" aria-label="timeline density">
          {(['comfortable', 'compact'] as Density[]).map((choice) => (
            <button
              key={choice}
              type="button"
              data-density-choice={choice}
              aria-label={`${choice} density`}
              aria-pressed={density === choice}
              onClick={() => setDensity(choice)}
            >
              {choice === 'comfortable' ? 'comfort' : 'compact'}
            </button>
          ))}
        </div>
      </div>
      {active ? (
        <div className="tag-banner">
          showing{' '}
          {filters.kind ? (
            <span>
              kind <span className="tg">{filters.kind}</span>
            </span>
          ) : null}
          {filters.kind && filters.tag ? ' · ' : null}
          {filters.tag ? (
            <span>
              tag <span className="tg">{filters.tag}</span>
            </span>
          ) : null}
          {' · '}
          <a
            href={window.location.pathname}
            className="clear"
            onClick={(event) => {
              event.preventDefault();
              navigate({ tag: '', kind: '' });
            }}
          >
            clear
          </a>
        </div>
      ) : null}
      <div className="visually-hidden" role="status" aria-live="polite">
        {status}
      </div>
    </>
  );
}

function mountAll() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-timeline-controls]')) {
    const data = readMountData(root);
    if (!data || data.options.length === 0) continue;
    createRoot(root).render(
      <StrictMode>
        <TimelineControls {...data} />
      </StrictMode>,
    );
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll, { once: true });
} else {
  mountAll();
}
