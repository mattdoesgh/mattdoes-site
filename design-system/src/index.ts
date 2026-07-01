// @mattdoes/ds — the mattdoes.online design system.
//
// These components are the single source of truth for the site's UI: they
// render the real static pages at build time (via the SSG harness) AND are the
// component library Claude Design builds with. Keep every export a named,
// PascalCase React component so the design-sync converter discovers it.
//
// This entry is intentionally CSS-free so it can run under Node for build-time
// SSG (renderToStaticMarkup). The stylesheet ships via the separate `styles`
// build entry (src/styles-entry.ts) and `static/_shared.css`.

// URL/format helpers — used when composing pages from the components.
export { safeUrl, relValue, fmtDate, fmtTime, isoAttr, fmtIsoDay, relTime, tagsHtml, escHtml, SITE_TZ } from './lib/format';
export type { DateInput, DateFormat } from './lib/format';

export { ThemeProvider, ACCENTS } from './theme/ThemeProvider';
export type { ThemeProviderProps, Theme, Accent } from './theme/ThemeProvider';

export { Layout } from './components/Layout';
export type { LayoutProps } from './components/Layout';

export { PageShell } from './components/PageShell';
export type { PageShellProps } from './components/PageShell';

export { IdentityRail } from './components/IdentityRail';
export type { IdentityRailProps, IdentityStat } from './components/IdentityRail';

export { ElsewhereLinks } from './components/ElsewhereLinks';
export type { ElsewhereLinksProps, ExternalLink } from './components/ElsewhereLinks';

export { Topbar, DEFAULT_NAV, DEFAULT_META } from './components/Topbar';
export type { TopbarProps, NavItem } from './components/Topbar';

export { Footer, DEFAULT_FOOTER_NAV } from './components/Footer';
export type { FooterProps } from './components/Footer';

export { StatusPill } from './components/StatusPill';
export type { StatusPillProps } from './components/StatusPill';

export { TweaksDialog } from './components/TweaksDialog';
export type { TweaksDialogProps } from './components/TweaksDialog';

export { Time } from './components/Time';
export type { TimeProps } from './components/Time';

export { Tag, TagList } from './components/Tag';
export type { TagProps, TagListProps } from './components/Tag';

export { TagCloud } from './components/TagCloud';
export type { TagCloudProps } from './components/TagCloud';

export { ActionLink } from './components/ActionLink';
export type { ActionLinkProps } from './components/ActionLink';

export { RailSection } from './components/RailSection';
export type { RailSectionProps } from './components/RailSection';

export { TimelineHeader } from './components/TimelineHeader';
export type { TimelineHeaderProps } from './components/TimelineHeader';

export { TimelineFilter } from './components/TimelineFilter';
export type { TimelineFilterProps, TimelineFilterLink } from './components/TimelineFilter';

export { TimelineGroup } from './components/TimelineGroup';
export type { TimelineGroupProps } from './components/TimelineGroup';

export { TimelineRow } from './components/TimelineRow';
export type { TimelineRowProps } from './components/TimelineRow';

export { ArticleRow } from './components/ArticleRow';
export type { ArticleRowProps } from './components/ArticleRow';

export { ThoughtRow } from './components/ThoughtRow';
export type { ThoughtRowProps } from './components/ThoughtRow';

// NB: no ListeningRow. The /listening/ rows are rendered server-side by
// templates/rows.js (the browser Row module) and injected into ListingPage as a
// raw HTML string, because static/listening-live.js re-renders them in the
// browser from that same module and dedupes by an innerHTML swap — so the
// markup must byte-equal rows.js output, which React serialization can't.
// rows.js owns the listening-row bytes; a React mirror here would only drift
// from that contract unnoticed. See ADR 0005 + test/row-parity.test.js.

export { EmptyState } from './components/EmptyState';
export type { EmptyStateProps, EmptyKind } from './components/EmptyState';
