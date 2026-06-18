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
export { safeUrl, relValue, fmtDate, fmtTime, isoAttr, SITE_TZ } from './lib/format';
export type { DateInput, DateFormat } from './lib/format';

export { ThemeProvider, ACCENTS } from './theme/ThemeProvider';
export type { ThemeProviderProps, Theme, Accent } from './theme/ThemeProvider';

export { Layout } from './components/Layout';
export type { LayoutProps } from './components/Layout';

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

export { ArticleRow } from './components/ArticleRow';
export type { ArticleRowProps } from './components/ArticleRow';

export { ThoughtRow } from './components/ThoughtRow';
export type { ThoughtRowProps } from './components/ThoughtRow';

export { ListeningRow } from './components/ListeningRow';
export type { ListeningRowProps } from './components/ListeningRow';

export { EmptyState } from './components/EmptyState';
export type { EmptyStateProps, EmptyKind } from './components/EmptyState';
