import type { ReactNode } from 'react';

export interface NavItem {
  /** Stable id used to mark the active link. */
  id?: string;
  href: string;
  label: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { id: 'listening', href: '/listening/', label: 'listening' },
  { id: 'about', href: '/about/', label: 'about' },
];

/** Letterboxd profile. Same chip as X; the short mark keeps an accessible name. */
export const LETTERBOXD_PROFILE = {
  href: 'https://letterboxd.com/mattdoes',
  label: 'letterboxd',
  mark: 'lb',
  rel: 'me noopener',
} as const;

/** Primary social link. External only — no on-site feed and no X API. */
export const X_PROFILE = {
  href: 'https://x.com/mattdoes',
  label: '@mattdoes',
  mark: 'X',
  rel: 'noopener noreferrer',
} as const;

const SOCIAL = [LETTERBOXD_PROFILE, X_PROFILE] as const;

/**
 * Kept as an empty export for package compatibility. Secondary destinations
 * now live in the footer rather than competing with the reading navigation.
 */
export const DEFAULT_META: NavItem[] = [];

export interface TopbarProps {
  /** Site title; the part after the first dot is dimmed in the brand mark. */
  siteTitle?: string;
  /** Primary nav links. Defaults to listening / about. */
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

function ChipLinks({ nav, active }: { nav: NavItem[]; active: string }) {
  return nav.map((n) => {
    const on = active === n.id;
    return (
      <a key={n.href} href={n.href} className={on ? 'on gb' : 'gb'} aria-current={on ? 'page' : undefined}>
        {n.label}
      </a>
    );
  });
}

function MenuLinks({ nav, active }: { nav: NavItem[]; active: string }) {
  return nav.map((n) => {
    const on = active === n.id;
    return (
      <a key={n.href} href={n.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
        {n.label}
      </a>
    );
  });
}

function SocialChip({
  profile,
  compact = false,
}: {
  profile: (typeof SOCIAL)[number];
  compact?: boolean;
}) {
  return (
    <a className={compact ? undefined : 'x-link gb'} href={profile.href} rel={profile.rel}>
      {compact ? (
        profile.label
      ) : (
        <>
          <span className="x-link__full">{profile.label}</span>
          <span className="x-link__short">
            {profile.mark}
            <span className="visually-hidden">, {profile.label}</span>
          </span>
        </>
      )}
    </a>
  );
}

/** The fixed top bar: brand, reading navigation, social chips, search, and a quiet status slot. */
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
          <ChipLinks nav={nav} active={active} />
        </nav>
        <nav className="social-nav" aria-label="social">
          {SOCIAL.map((profile) => <SocialChip key={profile.href} profile={profile} />)}
        </nav>
        <details className="mobile-menu">
          <summary>
            <span className="gb menu-chip">
              <span aria-hidden="true">menu</span>
              <span className="visually-hidden">Site menu</span>
            </span>
          </summary>
          <nav aria-label="site menu">
            <MenuLinks nav={nav} active={active} />
            {SOCIAL.map((profile) => <SocialChip key={profile.href} profile={profile} compact />)}
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
