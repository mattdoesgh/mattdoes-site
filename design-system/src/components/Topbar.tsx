import type { ReactNode } from 'react';

export interface NavItem {
  /** Stable id used to mark the active link. */
  id?: string;
  href: string;
  label: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { id: 'blog', href: '/blog/', label: 'writing' },
  { id: 'listening', href: '/listening/', label: 'listening' },
  { id: 'about', href: '/about/', label: 'about' },
];

/** Primary social link. External only — no on-site feed and no X API. */
export const X_PROFILE = {
  href: 'https://x.com/mattdoes',
  label: '@mattdoes',
} as const;

/**
 * Kept as an empty export for package compatibility. Secondary destinations
 * now live in the footer rather than competing with the reading navigation.
 */
export const DEFAULT_META: NavItem[] = [];

export interface TopbarProps {
  /** Site title; the part after the first dot is dimmed in the brand mark. */
  siteTitle?: string;
  /** Primary nav links. Defaults to writing / listening / about. */
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

function NavLinks({ nav, active, glass = false }: { nav: NavItem[]; active: string; glass?: boolean }) {
  return nav.map((n) => {
    const on = active === n.id;
    const className = [on ? 'on' : '', glass ? 'gb' : ''].filter(Boolean).join(' ');
    return (
      <a key={n.href} href={n.href} className={className || undefined} aria-current={on ? 'page' : undefined}>
        {n.label}
      </a>
    );
  });
}

function XLink({ compact = false }: { compact?: boolean }) {
  return (
    <a className={compact ? undefined : 'x-link gb'} href={X_PROFILE.href} rel="noopener noreferrer">
      {compact ? (
        X_PROFILE.label
      ) : (
        <>
          <span className="x-link__full">{X_PROFILE.label}</span>
          <span className="x-link__short">
            X<span className="visually-hidden">, {X_PROFILE.label}</span>
          </span>
        </>
      )}
    </a>
  );
}

/** The fixed top bar: brand, reading navigation, the X link, search, and a quiet status slot. */
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
          <NavLinks nav={nav} active={active} glass />
        </nav>
        <nav className="social-nav" aria-label="social">
          <XLink />
        </nav>
        <details className="mobile-menu">
          <summary>
            <span className="gb menu-chip">
              <span aria-hidden="true">menu</span>
              <span className="visually-hidden">Site menu</span>
            </span>
          </summary>
          <nav aria-label="site menu">
            <NavLinks nav={nav} active={active} />
            <XLink compact />
          </nav>
        </details>
        <a
          href={searchHref}
          className={searchIsCurrent ? 'search-control gb on' : 'search-control gb'}
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
