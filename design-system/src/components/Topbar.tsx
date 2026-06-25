import type { ReactNode } from 'react';

export interface NavItem {
  /** Stable id used to mark the active link. */
  id?: string;
  href: string;
  label: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { id: 'home', href: '/', label: 'home' },
  { id: 'blog', href: '/blog/', label: 'blog' },
  { id: 'thoughts', href: '/thoughts/', label: 'thoughts' },
  { id: 'making', href: '/making/', label: 'making' },
  { id: 'listening', href: '/listening/', label: 'listening' },
  { id: 'search', href: '/search/', label: 'search' },
  { id: 'about', href: '/about/', label: 'about' },
];

export const DEFAULT_META: NavItem[] = [
  { id: 'colophon', href: '/colophon/', label: 'colophon' },
  { id: 'say-hi', href: 'mailto:matt@mattdoes.online', label: 'say hi' },
];

export interface TopbarProps {
  /** Site title; the part after the first dot is dimmed in the brand mark. */
  siteTitle?: string;
  /** Primary nav links. Defaults to home / blog / listening / about. */
  nav?: NavItem[];
  /** Right-aligned meta links. Defaults to colophon / say hi. */
  meta?: NavItem[];
  /** Active nav/meta id — marks the matching link current. */
  active?: string;
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

/** The fixed top bar: brand mark, primary nav, meta links, and a status slot. */
export function Topbar({
  siteTitle = 'mattdoes.online',
  nav = DEFAULT_NAV,
  meta = DEFAULT_META,
  active = '',
  status,
}: TopbarProps) {
  return (
    <div className="topbar">
      <div className="inner">
        <a href="/" className="home">
          <Brand siteTitle={siteTitle} />
        </a>
        <nav aria-label="primary">
          {nav.map((n) => {
            const on = active === n.id;
            return (
              <a key={n.href} href={n.href} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
                {n.label}
              </a>
            );
          })}
        </nav>
        <span className="spacer"></span>
        {meta.map((m) => {
          const on = active === m.id;
          const isMailto = m.href.startsWith('mailto:');
          return (
            <a
              key={m.href}
              href={m.href}
              className={on ? 'meta-link on' : 'meta-link'}
              aria-current={on ? 'page' : undefined}
              data-prefetch={isMailto ? 'off' : undefined}
            >
              {m.label}
            </a>
          );
        })}
        {status}
      </div>
    </div>
  );
}
