import type { ReactNode } from 'react';
import { Topbar, type TopbarProps } from './Topbar';
import { Footer, type FooterProps } from './Footer';
import { TweaksDialog } from './TweaksDialog';

export interface LayoutProps {
  /** Page content — typically a `<main>` element. */
  children?: ReactNode;
  /** Props forwarded to the `Topbar` (brand, nav, active id, status). */
  topbar?: TopbarProps;
  /** Props forwarded to the `Footer` (text, nav). */
  footer?: FooterProps;
}

function CodeSheet({ id }: { id: string }) {
  return (
    <svg className="site-field__sheet">
      <defs>
        <pattern id={id} width="112" height="176" patternUnits="userSpaceOnUse">
          <rect x="22" y="30" width="1" height="6" fill="#d7e2e4" opacity="0.3" />
          <rect x="74" y="118" width="1" height="3" fill="#d7e2e4" opacity="0.16" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Faint code-pattern field. Decorative; Pause and reduced motion stop the drift. */
function SiteField() {
  return (
    <div className="site-field" aria-hidden="true">
      <div className="site-field__track">
        <CodeSheet id="site-code-a" />
        <CodeSheet id="site-code-b" />
      </div>
    </div>
  );
}

/**
 * The in-body page shell shared by every page: skip link, the faint field,
 * the geo-background mount point, the top bar, the page content, the footer,
 * and the tweaks dialog. The document `<head>` and the enhancement
 * `<script>`s are emitted by the build harness around this shell, not here.
 */
export function Layout({ children, topbar, footer }: LayoutProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        skip to content
      </a>
      <SiteField />
      <div id="geo-bg" aria-hidden="true"></div>
      <Topbar {...topbar} />
      {children}
      <Footer {...footer} />
      <TweaksDialog />
    </>
  );
}
