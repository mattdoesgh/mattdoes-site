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

/**
 * The in-body page shell shared by every page: skip link, the geo-background
 * mount point, the top bar, the page content, the footer, and the tweaks
 * dialog. The document `<head>` and the enhancement `<script>`s are emitted by
 * the build harness around this shell, not here.
 */
export function Layout({ children, topbar, footer }: LayoutProps) {
  return (
    <>
      <a className="skip-link" href="#main">
        skip to content
      </a>
      <div id="geo-bg" aria-hidden="true"></div>
      <Topbar {...topbar} />
      {children}
      <Footer {...footer} />
      <TweaksDialog />
    </>
  );
}
