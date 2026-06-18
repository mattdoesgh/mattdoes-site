import type { ReactNode } from 'react';
import { Layout } from './Layout';
import { StatusPill } from './StatusPill';
import type { NavItem } from './Topbar';

export interface PageShellProps {
  /** Active nav id (home / blog / listening / about / colophon). */
  active?: string;
  /** Brand text; the part after the first dot is dimmed. Defaults to the site title. */
  siteTitle?: string;
  /**
   * Manual topbar status override. When non-empty, a *static* status pill is
   * shown (no `id="now-playing"`, so the live poller leaves it alone) — the
   * `siteConfig.status` site-notice path. When empty, the live now-playing pill
   * is shown instead (mirrors templates/base.js).
   */
  manualStatus?: string;
  /** Live now-playing text, used when there's no manual override. */
  nowPlaying?: string;
  /** Footer text line. */
  footerText?: string;
  /** Footer nav override; defaults to the standard footer nav. */
  footerNav?: NavItem[];
  /** Page content — typically a `<main>`. */
  children?: ReactNode;
}

/**
 * The page chrome shared by every page: the in-body shell (via `Layout`) plus
 * the topbar status logic. Centralizes what `templates/base.js` computed once —
 * the manual-status-vs-live-now-playing branch and the brand title — so pages
 * only supply their `<main>` content.
 */
export function PageShell({
  active,
  siteTitle,
  manualStatus = '',
  nowPlaying = '',
  footerText = '',
  footerNav,
  children,
}: PageShellProps) {
  const status = manualStatus ? (
    <StatusPill text={manualStatus} />
  ) : (
    <StatusPill text={nowPlaying} dot live />
  );
  return (
    <Layout topbar={{ siteTitle, active, status }} footer={{ footerText, nav: footerNav }}>
      {children}
    </Layout>
  );
}
