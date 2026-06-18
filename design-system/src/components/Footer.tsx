import type { NavItem } from './Topbar';

export const DEFAULT_FOOTER_NAV: NavItem[] = [
  { href: '/blog/', label: 'blog' },
  { href: '/colophon/', label: 'colophon' },
  { href: 'mailto:matt@mattdoes.online', label: 'say hi' },
  { href: '/feed.xml', label: 'rss' },
];

export interface FooterProps {
  /** Free-text line shown at the start of the footer (e.g. a copyright). */
  footerText?: string;
  /** Footer links. Defaults to blog / colophon / say hi / rss. */
  nav?: NavItem[];
}

/**
 * The site footer: a text line, footer nav, and the `tweaks` toggle button
 * (the client tweaks script opens the `#tweaks` dialog from it).
 */
export function Footer({ footerText = '', nav = DEFAULT_FOOTER_NAV }: FooterProps) {
  return (
    <footer className="site">
      <div>{footerText}</div>
      <nav aria-label="footer">
        {nav.map((n) => (
          <a key={n.href} href={n.href} data-prefetch={n.href.startsWith('mailto:') ? 'off' : undefined}>
            {n.label}
          </a>
        ))}
        <button type="button" className="footer-link" data-tweaks-toggle="" aria-controls="tweaks" aria-expanded="false">
          tweaks
        </button>
      </nav>
    </footer>
  );
}
