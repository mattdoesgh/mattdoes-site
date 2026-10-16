import type { NavItem } from './Topbar';
import { safeUrl, relValue } from '../lib/format';

export const DEFAULT_FOOTER_NAV: NavItem[] = [
  { id: 'digs', href: '/digs/', label: 'digs' },
  { id: 'movies', href: '/movies/', label: 'movies' },
  { id: 'grok', href: '/grok/', label: 'grok says' },
  { href: '/colophon/', label: 'colophon' },
  { href: 'mailto:matt@mattdoes.online', label: 'say hi' },
];

/**
 * Profile links (no feeds). Href set is pinned to site.config.js `links` by
 * test/shared-chrome.test.js — update both together.
 */
export const DEFAULT_PROFILES: NavItem[] = [
  { href: 'https://letterboxd.com/mattdoes', label: 'letterboxd' },
  { href: 'https://x.com/mattdoes', label: 'x' },
  { href: 'https://www.instagram.com/mattdoes.ig', label: 'instagram' },
  { href: 'https://www.last.fm/user/djverism', label: 'last.fm' },
];

export interface FooterProps {
  /** Free-text line shown at the start of the footer (e.g. a copyright). */
  footerText?: string;
  /** Footer links. Defaults to the log pages, colophon, and say hi. */
  nav?: NavItem[];
  /** Off-site profile links. Defaults to Letterboxd, X, Instagram, Last.fm. */
  profiles?: NavItem[];
  /** Active page id — marks the matching footer link current. */
  active?: string;
}

/**
 * The site footer: a text line, footer nav, and the `tweaks` toggle button
 * (the client tweaks script opens the `#tweaks` dialog from it).
 */
export function Footer({
  footerText = '',
  nav = DEFAULT_FOOTER_NAV,
  profiles = DEFAULT_PROFILES,
  active = '',
}: FooterProps) {
  return (
    <footer className="site">
      {footerText ? <p className="footer-copy">{footerText}</p> : null}
      <div className="footer-links">
        <nav aria-label="footer">
          {nav.map((n) => {
            const on = Boolean(n.id && active === n.id);
            return (
              <a
                key={n.href}
                href={safeUrl(n.href)}
                data-prefetch={n.href.startsWith('mailto:') ? 'off' : undefined}
                aria-current={on ? 'page' : undefined}
              >
                {n.label}
              </a>
            );
          })}
          <button type="button" className="footer-link" data-tweaks-toggle="" aria-controls="tweaks" aria-expanded="false" aria-haspopup="dialog">
            tweaks
          </button>
        </nav>
        {profiles.length ? (
          <nav aria-label="profiles">
            {profiles.map((n) => (
              <a key={n.href} href={safeUrl(n.href)} rel={relValue(n.href)}>
                {n.label}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
    </footer>
  );
}
