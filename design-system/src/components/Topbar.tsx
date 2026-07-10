import type { ReactNode } from 'react';

export interface NavItem {
  /** Stable id used to mark the active link. */
  id?: string;
  href: string;
  label: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { id: 'blog', href: '/blog/', label: 'writing' },
  { id: 'thoughts', href: '/thoughts/', label: 'thoughts' },
  { id: 'listening', href: '/listening/', label: 'listening' },
  { id: 'about', href: '/about/', label: 'about' },
];

/**
 * Kept as an empty export for package compatibility. Secondary destinations
 * now live in the footer rather than competing with the reading navigation.
 */
export const DEFAULT_META: NavItem[] = [];

export interface TopbarProps {
  /** Site title; the part after the first dot is dimmed in the brand mark. */
  siteTitle?: string;
  /** Primary nav links. Defaults to writing / thoughts / listening / about. */
  nav?: NavItem[];
  /** Active nav/meta id — marks the matching link current. */
  active?: string;
  /** Compact search control destination. */
  searchHref?: string;
  /** Right-most status slot, typically a `StatusPill`. */
  status?: ReactNode;
}

function Brand({ siteTitle }: { siteTitle: string }) {
  if (!siteTitle.includes('.')) return <>{siteTitle}</>;
  const [head, ...rest] = siteTitle.split('.');
  return (
    <>
      {head}
      <span className="dim">.{rest.join('.')}</span>
    </>
  );
}

function NavLinks({ nav, active }: { nav: NavItem[]; active: string }) {
  return nav.map((n) => {
    const on = active === n.id;
    return (
      <a key={n.href} href={n.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
        {n.label}
      </a>
    );
  });
}

/** The fixed top bar: brand, reading navigation, search, and a quiet status slot. */
export function Topbar({
  siteTitle = 'mattdoes.online',
  nav = DEFAULT_NAV,
  active = '',
  searchHref = '/search/',
  status,
}: TopbarProps) {
  const searchIsCurrent = active === 'search';
  return (
    <header className="topbar" aria-label="site">
      <div className="inner">
        <a href="/" className="home">
          <Brand siteTitle={siteTitle} />
        </a>
        <nav className="primary-nav" aria-label="primary">
          <NavLinks nav={nav} active={active} />
        </nav>
        <details className="mobile-menu">
          <summary>
            <span aria-hidden="true">menu</span>
            <span className="visually-hidden">Open site menu</span>
          </summary>
          <nav aria-label="site menu">
            <NavLinks nav={nav} active={active} />
          </nav>
        </details>
        <a
          href={searchHref}
          className={searchIsCurrent ? 'search-control on' : 'search-control'}
          aria-label="search"
          aria-current={searchIsCurrent ? 'page' : undefined}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.25 10.25 3.25 3.25" />
          </svg>
        </a>
        <span className="spacer" aria-hidden="true"></span>
        {status}
      </div>
    </header>
  );
}
